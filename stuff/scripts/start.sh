#!/usr/bin/env bash

# 🚀 MyCoinwise - One-Command Browser Launcher
# Runs backend + frontend and automatically opens http://localhost:5173

cd "$(dirname "$0")" || exit 1
node start.js
