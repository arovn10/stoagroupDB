# Asana API Reference Notes

## Overview
This document contains notes and important information about the Asana API for the Deal Pipeline dashboard.

**API Documentation**: https://developers.asana.com/reference/rest-api-reference  
**Base URL**: `https://app.asana.com/api/1.0`

## Authentication

### Personal Access Token (PAT) - Recommended for Development
1. Go to https://app.asana.com/0/my-apps
2. Create a new personal access token
3. Format: `1/1234567890:abcdefghijklmnopqrstuvwxyz`
4. Use in Authorization header: `Bearer {token}`

### OAuth 2.0 - Recommended for Production
- Register your app at https://app.asana.com/0/developer-console
- Use authorization code flow
- Store tokens securely

## Rate Limits
- **150 requests per minute** per user
- Implement exponential backoff for 429 errors
- Use batch API for multiple operations

## Important Endpoints for Deal Pipeline

### Tasks (Most Critical)
- `GET /tasks` - List all tasks
- `GET /tasks/{task_gid}` - Get task details
- `POST /tasks` - **Create new deals** (writeback)
- `PUT /tasks/{task_gid}` - **Update deals** (writeback)
- `GET /projects/{project_gid}/tasks` - Get tasks in Deal Pipeline project

### Custom Fields (Critical for Deal Data)
- `GET /workspaces/{workspace_gid}/custom_fields` - List all custom fields
- `GET /custom_fields/{custom_field_gid}` - Get custom field details
- `PUT /tasks/{task_gid}` with `custom_fields` - **Update custom field values** (writeback)

### Projects
- `GET /projects/{project_gid}` - Get Deal Pipeline project
- `GET /projects/{project_gid}/tasks` - Get all deals

## Writeback Functionality (Future)

### Key Endpoints for Writeback:

1. **Update Task Custom Fields**
   ```
   PUT /tasks/{task_gid}
   {
     "data": {
       "custom_fields": {
         "{custom_field_gid}": "value"  // For text/number fields
         // OR
         "{custom_field_gid}": "{enum_option_gid}"  // For enum fields
       }
     }
   }
   ```

2. **Update Task Details**
   ```
   PUT /tasks/{task_gid}
   {
     "data": {
       "name": "Updated Deal Name",
       "notes": "Updated notes",
       "due_on": "2024-12-31",
       "completed": false
     }
   }
   ```

3. **Create New Deal**
   ```
   POST /tasks
   {
     "data": {
       "name": "New Deal Name",
       "notes": "Deal details...",
       "projects": ["{project_gid}"],
       "custom_fields": {
         "{bank_field_gid}": "Bank Name",
         "{location_field_gid}": "City, State",
         // etc.
       }
     }
   }
   ```

4. **Add Comments/Stories**
   ```
   POST /tasks/{task_gid}/stories
   {
     "data": {
       "text": "Comment text here"
     }
   }
   ```

## Custom Field Types

When updating custom fields via API:
- **Text**: Pass string value directly
- **Number**: Pass number value
- **Enum**: Pass enum option GID (not the name)
- **Multi-Enum**: Pass array of enum option GIDs
- **Date**: Pass date string in YYYY-MM-DD format
- **People**: Pass user GID

## Finding Custom Field GIDs

1. Use: `GET /workspaces/{workspace_gid}/custom_fields`
2. Or: `GET /projects/{project_gid}/custom_field_settings`
3. Look for fields like:
   - Bank
   - Location
   - Product Type
   - Stage
   - Start Date
   - Unit Count
   - Pre-Con Manager

## Error Handling

Common HTTP Status Codes:
- `200` - Success
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Server Error

## Best Practices

1. **Use opt_fields** to request only needed fields (reduces payload)
2. **Use batch API** for multiple operations
3. **Cache custom field GIDs** (they don't change often)
4. **Handle rate limits** gracefully with retry logic
5. **Use webhooks** for real-time updates (instead of polling)

## Notes for Implementation

- All GIDs (Global IDs) are strings, not numbers
- Dates should be in ISO 8601 format (YYYY-MM-DD)
- Use `opt_pretty=true` for human-readable responses (development only)
- Use `opt_fields` to reduce response size
- Custom field values must match the field type exactly

## Future Enhancements

1. **Real-time Sync**: Use webhooks to detect changes in Asana
2. **Bidirectional Sync**: Update Asana when changes are made in Domo
3. **Bulk Operations**: Use batch API for updating multiple deals
4. **Conflict Resolution**: Handle cases where data is updated in both systems

