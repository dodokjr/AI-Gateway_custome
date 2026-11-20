#!/usr/bin/env bash
cd "$(dirname "$0")"
pkill -f gateway-server; sleep 1
go build -o gateway-server ./cmd/server || { echo "BUILD GAGAL"; exit 1; }
nohup ./gateway-server >> server.log 2>&1 &
echo $! > server.pid
sleep 2
curl -s localhost:8080/healthz; echo
tail -3 server.log
