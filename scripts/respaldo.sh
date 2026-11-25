#!/bin/bash
# Respaldo diario de la base de MediCert (guarda los últimos 30 días)
set -e
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST=/var/backups/medicert
mkdir -p "$DEST"
cd "$APP_DIR"
node -e "require('better-sqlite3')('data/medicert.db').backup('$DEST/medicert_$(date +%F).db').then(()=>console.log('ok'))"
find "$DEST" -name 'medicert_*.db' -mtime +30 -delete
