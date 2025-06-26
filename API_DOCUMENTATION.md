# Lab Test API Documentation

## GET /lab-test/sessions

This endpoint retrieves lab sessions with comprehensive search, filter, and sort capabilities.

### Query Parameters

| Parameter   | Type   | Description                              | Example                   |
| ----------- | ------ | ---------------------------------------- | ------------------------- |
| `page`      | number | Page number (starts from 1)              | `1`                       |
| `limit`     | number | Number of items per page (1-100)         | `10`                      |
| `search`    | string | Search by patient personalId or fullName | `"john"` or `"123456789"` |
| `filter`    | object | Filter by status or other criteria       | `{"status": "pending"}`   |
| `sortBy`    | string | Field to sort by                         | `"fullName"`              |
| `sortOrder` | string | Sort direction (ASC/DESC)                | `"ASC"`                   |

### Search Functionality

The `search` parameter performs a case-insensitive search across:

- **Patient Personal ID** (`patient.personalId`)
- **Patient Full Name** (`patient.fullName`)

**Examples:**

```
GET /lab-test/sessions?search=john
GET /lab-test/sessions?search=123456789
GET /lab-test/sessions?search=john doe
```

### Filter Functionality

The `filter` parameter accepts a JSON object for filtering results. Currently supported filters:

#### Filter by Status

Filter lab sessions by FastQ file status:

- `pending` - Files waiting to be processed
- `processing` - Files currently being processed
- `completed` - Successfully processed files
- `failed` - Files that failed processing
- `rejected` - Files that were rejected

**Examples:**

```
GET /lab-test/sessions?filter={"status":"pending"}
GET /lab-test/sessions?filter={"status":"completed"}
```

### Sort Functionality

The `sortBy` parameter supports sorting by any of the following fields:

#### Lab Session Fields

- `id` - Lab session ID
- `labcode` - Lab code
- `barcode` - Barcode
- `requestDate` - Request date
- `createdAt` - Creation timestamp

#### Patient Fields

- `patient.id` - Patient ID
- `patient.fullName` or `fullName` - Patient full name
- `patient.personalId` or `personalId` - Patient personal ID
- `patient.dateOfBirth` - Patient date of birth
- `patient.phone` - Patient phone number
- `patient.address` - Patient address
- `patient.healthInsuranceCode` - Health insurance code
- `patient.createdAt` - Patient creation timestamp

#### Doctor Fields

- `doctor.id` - Doctor ID
- `doctor.name` or `doctorName` - Doctor name
- `doctor.email` or `doctorEmail` - Doctor email

**Examples:**

```
GET /lab-test/sessions?sortBy=fullName&sortOrder=ASC
GET /lab-test/sessions?sortBy=requestDate&sortOrder=DESC
GET /lab-test/sessions?sortBy=doctorName&sortOrder=ASC
```

### Combined Usage Examples

#### Search for patients with "john" and sort by full name:

```
GET /lab-test/sessions?search=john&sortBy=fullName&sortOrder=ASC
```

#### Filter pending files and search for specific personal ID:

```
GET /lab-test/sessions?search=123456789&filter={"status":"pending"}
```

#### Paginated results with search and sort:

```
GET /lab-test/sessions?page=2&limit=20&search=smith&sortBy=createdAt&sortOrder=DESC
```

#### Complex filtering with pagination:

```
GET /lab-test/sessions?page=1&limit=50&filter={"status":"completed"}&sortBy=requestDate&sortOrder=ASC
```

### Response Format

```json
{
  "data": [
    {
      "id": 1,
      "labcode": "LAB001",
      "barcode": "BC001",
      "requestDate": "2024-01-15",
      "createdAt": "2024-01-15T10:30:00Z",
      "metadata": {},
      "patient": {
        "id": 1,
        "fullName": "John Doe",
        "personalId": "123456789",
        "dateOfBirth": "1990-01-01",
        "phone": "+1234567890",
        "address": "123 Main St",
        "healthInsuranceCode": "HIC001",
        "createdAt": "2024-01-15T09:00:00Z"
      },
      "doctor": {
        "id": 1,
        "name": "Dr. Smith",
        "email": "dr.smith@hospital.com",
        "metadata": {}
      },
      "latestFastqFile": {
        "id": 1,
        "filePath": "https://account-id.r2.cloudflarestorage.com/fastq-file/fastq/1/1642248000000_sample.fastq",
        "createdAt": "2024-01-15T11:00:00Z",
        "status": "completed",
        "redoReason": null,
        "creator": {
          "id": 1,
          "name": "Lab Tech",
          "email": "tech@lab.com"
        }
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  },
  "success": true,
  "timestamp": "2024-01-15T12:00:00Z"
}
```

### Error Handling

The API will return validation errors for invalid parameters:

```json
{
  "statusCode": 400,
  "message": [
    "page must be a positive number",
    "limit must not be greater than 100"
  ],
  "error": "Bad Request"
}
```

### Performance Notes

- Search operations are case-insensitive and use LIKE queries
- Filter by status uses subqueries for accurate results
- All queries are paginated to ensure good performance
- Default sorting is by `createdAt DESC` if no sort parameters are provided
- Maximum limit is 100 items per page to prevent performance issues

---

## POST /lab-test/session/:id/fastq

Upload a FastQ file for a specific lab session.

### Authentication

- **Required Roles**: Lab Testing Technician
- **Authorization**: Bearer token required

### Path Parameters

| Parameter | Type   | Description    |
| --------- | ------ | -------------- |
| `id`      | number | Lab session ID |

### Request Format

- **Content-Type**: `multipart/form-data`
- **File Field**: `fastq`

### Example Request

```bash
curl -X POST \
  http://localhost:3000/api/v1/lab-test/session/123/fastq \
  -H "Authorization: Bearer your-jwt-token" \
  -F "fastq=@sample.fastq"
```

### Response

```json
{
  "message": "FastQ file uploaded successfully"
}
```

### Error Responses

**Session Not Found (404)**:

```json
{
  "statusCode": 404,
  "message": "Session with id 123 not found",
  "error": "Not Found"
}
```

**Upload Failed (500)**:

```json
{
  "statusCode": 500,
  "message": "Failed to upload file to S3: connection timeout",
  "error": "Internal Server Error"
}
```

---

## GET /lab-test/fastq/:fastqFileId/download

Generate a presigned download URL for a FastQ file.

### Authentication

- **Required Roles**: Lab Testing Technician, Analysis Technician, Validation Technician, Doctor
- **Authorization**: Bearer token required

### Path Parameters

| Parameter     | Type   | Description   |
| ------------- | ------ | ------------- |
| `fastqFileId` | number | FastQ file ID |

### Example Request

```bash
curl -X GET \
  http://localhost:3000/api/v1/lab-test/fastq/456/download \
  -H "Authorization: Bearer your-jwt-token"
```

### Response Format

```json
{
  "downloadUrl": "https://account-id.r2.cloudflarestorage.com/fastq-file/fastq/123/1642248000000_sample.fastq?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...",
  "expiresIn": 3600,
  "expiresAt": "2024-01-15T13:00:00.000Z"
}
```

### Response Fields

| Field         | Type   | Description                            |
| ------------- | ------ | -------------------------------------- |
| `downloadUrl` | string | Presigned URL for downloading the file |
| `expiresIn`   | number | URL expiration time in seconds (3600s) |
| `expiresAt`   | string | ISO timestamp when the URL expires     |

### Usage

The returned `downloadUrl` can be used directly to download the file:

```bash
curl -O "https://account-id.r2.cloudflarestorage.com/fastq-file/fastq/123/1642248000000_sample.fastq?X-Amz-Algorithm=..."
```

Or in a browser by navigating to the URL directly.

### Error Responses

**FastQ File Not Found (404)**:

```json
{
  "statusCode": 404,
  "message": "FastQ file with id 456 not found",
  "error": "Not Found"
}
```

**No File Path (404)**:

```json
{
  "statusCode": 404,
  "message": "No file path found for FastQ file with id 456",
  "error": "Not Found"
}
```

**URL Generation Failed (500)**:

```json
{
  "statusCode": 500,
  "message": "Failed to generate download URL: Invalid S3 URL format",
  "error": "Internal Server Error"
}
```

### Security Notes

- Presigned URLs are valid for 1 hour (3600 seconds) only
- URLs are signed with your S3 credentials and cannot be forged
- Access is controlled by role-based authentication
- URLs are single-use and expire automatically
