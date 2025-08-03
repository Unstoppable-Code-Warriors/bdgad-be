#!/bin/bash

# Test script for categorized file upload API

# Base URL
BASE_URL="http://localhost:3000"
API_ENDPOINT="${BASE_URL}/staff/patient-files/upload-v2"

# Test data
PATIENT_ID=1
TYPE_LAB_SESSION="test"

# File categories JSON
FILE_CATEGORIES='[
  {
    "category": "hereditary_cancer",
    "priority": 8,
    "fileName": "hereditary_cancer_form.pdf"
  },
  {
    "category": "gene_mutation", 
    "priority": 7,
    "fileName": "gene_mutation_test.jpg"
  },
  {
    "category": "general",
    "priority": 5,
    "fileName": "general_document.txt"
  }
]'

# OCR results JSON (optional)
OCR_RESULTS='[
  {
    "fileIndex": 0,
    "category": "hereditary_cancer",
    "confidence": 0.95,
    "ocrData": {
      "full_name": "Nguyen Van A",
      "date_of_birth": "1990-01-01",
      "cancer_screening_package": "bcare"
    }
  }
]'

# Lab codes (optional)
LAB_CODES='["O5123A", "N5456B"]'

echo "Testing categorized file upload API..."
echo "Endpoint: ${API_ENDPOINT}"
echo ""

# Create test files
echo "Creating test files..."
echo "This is a test PDF content for hereditary cancer screening" > /tmp/hereditary_cancer_form.pdf
echo "Test image content for gene mutation" > /tmp/gene_mutation_test.jpg
echo "General document content" > /tmp/general_document.txt

# Test the API using curl
echo "Sending request..."
curl -X POST "${API_ENDPOINT}" \
  -H "Content-Type: multipart/form-data" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "patientId=${PATIENT_ID}" \
  -F "typeLabSession=${TYPE_LAB_SESSION}" \
  -F "fileCategories=${FILE_CATEGORIES}" \
  -F "ocrResults=${OCR_RESULTS}" \
  -F "labcode=${LAB_CODES}" \
  -F "files=@/tmp/hereditary_cancer_form.pdf" \
  -F "files=@/tmp/gene_mutation_test.jpg" \
  -F "files=@/tmp/general_document.txt" \
  --verbose

echo ""
echo "Test completed!"

# Cleanup
rm -f /tmp/hereditary_cancer_form.pdf /tmp/gene_mutation_test.jpg /tmp/general_document.txt
