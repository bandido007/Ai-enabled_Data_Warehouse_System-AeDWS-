FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System dependencies for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# Bake static files into the image so Whitenoise has something to serve.
RUN python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["gunicorn", "warehouse_dms.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--timeout", "120"]
