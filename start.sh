#!/bin/bash
# chmod +x start.sh
# Start the Electron app
npx electron GUI-main.js

sleep 1
docker compose up --build