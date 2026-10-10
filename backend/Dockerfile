FROM python:3.13-slim AS base

# Install system dependencies for OpenCV headlessly
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --no-deps -r requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/app ./app

# Create storage directories
RUN mkdir -p storage/uploads/evidence storage/uploads/inspections storage/uploads/reference

# Create non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app /workspace
USER appuser

EXPOSE 8000

# Run with Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
