import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, throwError, retry, timer, firstValueFrom } from 'rxjs';

@Injectable()
export class RabbitmqService {
  private readonly logger = new Logger(RabbitmqService.name);
  private isConnected = false;

  constructor(
    @Inject('GENERAL_FILE_SERVICE') private readonly client: ClientProxy,
  ) {}

  async onApplicationBootstrap() {
    await this.connectToRabbitMQ();
  }

  private async connectToRabbitMQ() {
    try {
      if (!this.isConnected) {
        await this.client.connect();
        this.isConnected = true;
        this.logger.log('Successfully connected to RabbitMQ');
      }
    } catch (error) {
      this.isConnected = false;
      this.logger.error('Failed to connect to RabbitMQ', error);

      setTimeout(() => this.connectToRabbitMQ(), 2000);
    }
  }

  async ensureConnection() {
    if (!this.isConnected) {
      await this.connectToRabbitMQ();
    }
    return this.isConnected;
  }

  sendMessage<T>(pattern: any, data: any) {
    this.logger.debug(`Sending message to ${JSON.stringify(pattern)}`);

    return firstValueFrom(
      this.client.send<T>(pattern, data).pipe(
        retry({
          count: 2,
          delay: (_, retryCount) => {
            this.logger.warn(
              `Retrying message send (attempt ${retryCount}/2) to ${JSON.stringify(pattern)}`,
            );
            return timer(retryCount * 1000);
          },
        }),
        catchError(async (error) => {
          if (
            error?.message?.includes('There is no matching message handler') ||
            error?.message?.includes(
              'There is no matching message handler defined in the remote service.',
            ) ||
            error?.message?.includes('connect ECONNREFUSED') ||
            error?.message?.includes('channel closed')
          ) {
            this.logger.error(
              `Connection issue or no handler found for pattern: ${JSON.stringify(pattern)}`,
            );

            this.isConnected = false;
            await this.connectToRabbitMQ();

            return throwError(
              () =>
                new Error(
                  `Connection issue or not found handler for ${JSON.stringify(pattern)}`,
                ),
            );
          }

          this.logger.error(
            `Error preparing message to ${JSON.stringify(pattern)}`,
            error,
          );
          return throwError(() => error);
        }),
      ),
    );
  }

  async emitEvent(pattern: string, data: any): Promise<void> {
    try {
      await this.ensureConnection();

      this.client.emit(pattern, data);
      this.logger.debug(`Event emitted to ${pattern}`);
    } catch (error) {
      this.logger.error(`Error emitting event to ${pattern}`, error);

      this.isConnected = false;
      await this.connectToRabbitMQ();

      try {
        if (this.isConnected) {
          this.client.emit(pattern, data);
          this.logger.debug(
            `Event re-emitted to ${pattern} after reconnection`,
          );
        }
      } catch (retryError) {
        this.logger.error(
          `Failed to re-emit event after reconnection`,
          retryError,
        );
        throw retryError;
      }
    }
  }
}
