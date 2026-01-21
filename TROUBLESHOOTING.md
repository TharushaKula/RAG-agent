# Troubleshooting Semantic Search

## Common Error: "Embedding service is not available"

### Quick Fix

1. **Start the embedding service:**
   ```bash
   cd embedding-service
   docker-compose up --build
   ```

2. **Verify it's running:**
   ```bash
   curl http://localhost:8000/health
   ```
   
   You should see:
   ```json
   {
     "status": "healthy",
     "service": "SBERT Embedding Service",
     "model": "all-MiniLM-L6-v2"
   }
   ```

3. **Check backend configuration:**
   
   Make sure your `.env` file in the `backend/` directory has:
   ```
   EMBEDDING_SERVICE_URL=http://localhost:8000
   ```
   
   Or if running on a different host/port:
   ```
   EMBEDDING_SERVICE_URL=http://your-host:8000
   ```

### Detailed Error Messages

The improved error handling will now show specific errors:

- **ECONNREFUSED**: Service is not running
  - Solution: Start the embedding service with `docker-compose up`

- **ETIMEDOUT**: Service is taking too long to respond
  - Solution: Check if the service is overloaded or check network connectivity

- **ENOTFOUND**: Cannot resolve the hostname
  - Solution: Check the URL in your `.env` file

### Verification Steps

1. **Check if Docker is running:**
   ```bash
   docker ps
   ```
   You should see a container named `embedding-service` or similar.

2. **Check service logs:**
   ```bash
   cd embedding-service
   docker-compose logs
   ```
   
   Look for:
   - Model loading messages
   - "Application startup complete"
   - Any error messages

3. **Test the service directly:**
   ```bash
   curl -X POST http://localhost:8000/embed \
     -H "Content-Type: application/json" \
     -d '{"text": "test"}'
   ```

4. **Check backend logs:**
   
   When you start the backend, you should see:
   ```
   ✅ Embedding service is available: { status: 'healthy', ... }
   ```
   
   Or if not available:
   ```
   ⚠️  Embedding service is not available: { url: '...', error: '...' }
   ```

### Port Conflicts

If port 8000 is already in use:

1. **Change the port in docker-compose.yml:**
   ```yaml
   ports:
     - "8001:8000"  # Use 8001 instead
   ```

2. **Update backend .env:**
   ```
   EMBEDDING_SERVICE_URL=http://localhost:8001
   ```

### Model Download Issues

On first run, the service downloads the SBERT model (~80MB). This may take a few minutes.

If download fails:
- Check internet connection
- Check Docker has enough disk space
- Try running manually to see detailed errors:
  ```bash
  cd embedding-service
  pip install -r requirements.txt
  python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
  ```

### Still Having Issues?

1. **Check all services are running:**
   - Backend: `http://localhost:3001`
   - Embedding Service: `http://localhost:8000`

2. **Check firewall/network:**
   - Ensure localhost connections are allowed
   - Check if any firewall is blocking port 8000

3. **View detailed logs:**
   ```bash
   # Backend logs
   npm run dev  # or your start command
   
   # Embedding service logs
   cd embedding-service
   docker-compose logs -f
   ```

4. **Test connectivity:**
   ```bash
   # From backend directory
   curl http://localhost:8000/health
   ```
