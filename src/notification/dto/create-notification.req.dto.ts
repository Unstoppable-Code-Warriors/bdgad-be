export class CreateNotificationReqDto {
  title: string;
  message: string;
  type: string;
  senderId: number;
  receiverId: number;
}
