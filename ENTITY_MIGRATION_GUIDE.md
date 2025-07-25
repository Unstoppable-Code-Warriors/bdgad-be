# FastqFile to FastqFilePair Migration Guide

## Summary of Changes Made

1. **FastqFile Entity** - Now only stores file information:
   - id
   - filePath
   - createdAt

2. **FastqFilePair Entity** - New entity for workflow management:
   - Links two FastqFile entities (R1 and R2)
   - Manages status, approval, rejection workflow
   - Contains creator, rejector, approver relationships

## Services That Need Updates

### ✅ Analysis Service
- Updated to work with FastqFilePair
- Controller updated for fastqFilePairId parameters
- DTOs updated

### ❌ Lab-test Service
- Needs major refactoring
- Should create FastqFile entities for uploads
- Should create FastqFilePair entities for workflow
- Currently has compilation errors

### ❌ Validation Service  
- Partially updated
- Needs to work with FastqFilePair for status updates

## Required Database Changes

The database schema needs:
1. Keep `fastq_files` table simple
2. Update `fastq_file_pairs` table with proper relationships
3. Update `lab_sessions` to reference `fastq_file_pairs` not `fastq_files`

## API Changes Required

- Analysis endpoints now use `fastqFilePairId` instead of `fastqFileId`
- Lab-test endpoints may need new pairing endpoints
- Response DTOs updated to reflect new structure

## Next Steps

1. Fix lab-test service compilation errors
2. Update lab-test service logic for new workflow
3. Test the new workflow end-to-end
4. Update API documentation
