#!/usr/bin/env bash

echo "Stopping existing services..."

# Kill backend
pkill -f "src/app.py"
pkill -f "gunicorn"
# Kill frontend
pkill -f "next-server"
pkill -f "next dev"
pkill -f "next start"

# Wait for ports to clear
sleep 2

echo "Starting Backend on port 5001..."
cd backend

if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install -r requirements.txt

# Production: gunicorn with multiple workers instead of raw python
nohup env PYTHONPATH=src .venv/bin/gunicorn \
    --workers 4 \
    --bind 127.0.0.1:5001 \
    --timeout 120 \
    --access-logfile access.log \
    --error-logfile error.log \
    "app:app" > debug.log 2>&1 &
echo "Backend started (PID: $!)"

cd ..

echo "Building Frontend..."
cd frontend

if [ ! -d "node_modules" ]; then
    npm install
fi

# Production: build first, then start (not next dev)
npm run build

nohup npm run start > frontend.log 2>&1 &
echo "Frontend started (PID: $!)"

cd ..

echo "------------------------------------------"
echo "Services are starting in the background."
echo "Backend:  http://localhost:5001"
echo "Frontend: http://localhost:3000"
echo "------------------------------------------"
echo "Logs: backend/debug.log, backend/access.log, frontend/frontend.log"
