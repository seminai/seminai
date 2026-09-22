#!/bin/bash

# Script per monitorare il Keep-Alive Service in tempo reale
# Uso: ./scripts/monitor-keepalive.sh [SERVER_URL]

# Configurazione
SERVER_URL="${1:-http://localhost:8081}"
INTERVAL=5  # Secondi tra ogni check

# Colori per output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔄 Keep-Alive Service Monitor"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Server: $SERVER_URL"
echo "Interval: ${INTERVAL}s"
echo "Press Ctrl+C to stop"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

while true; do
  # Ottieni status
  response=$(curl -s "$SERVER_URL/keep-alive/status")
  
  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to connect to server${NC}"
    sleep $INTERVAL
    continue
  fi

  # Parse JSON (richiede jq)
  if command -v jq &> /dev/null; then
    isEnabled=$(echo "$response" | jq -r '.data.isEnabled')
    totalRequests=$(echo "$response" | jq -r '.data.totalRequests')
    successfulRequests=$(echo "$response" | jq -r '.data.successfulRequests')
    failedRequests=$(echo "$response" | jq -r '.data.failedRequests')
    successRate=$(echo "$response" | jq -r '.data.successRate')
    consecutiveFailures=$(echo "$response" | jq -r '.data.consecutiveFailures')
    healthStatus=$(echo "$response" | jq -r '.data.healthStatus')
    uptime=$(echo "$response" | jq -r '.data.uptime')
    
    # Clear screen
    clear
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  🔄 Keep-Alive Service Monitor"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Server: $SERVER_URL"
    echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Status
    if [ "$isEnabled" = "true" ]; then
      echo -e "Status: ${GREEN}✅ ENABLED${NC}"
    else
      echo -e "Status: ${YELLOW}⏸️  DISABLED${NC}"
    fi
    
    # Health
    case $healthStatus in
      "healthy")
        echo -e "Health: ${GREEN}✅ HEALTHY${NC}"
        ;;
      "degraded")
        echo -e "Health: ${YELLOW}⚠️  DEGRADED${NC}"
        ;;
      "warning")
        echo -e "Health: ${YELLOW}⚠️  WARNING${NC}"
        ;;
      "critical")
        echo -e "Health: ${RED}🚨 CRITICAL${NC}"
        ;;
      "unhealthy")
        echo -e "Health: ${RED}❌ UNHEALTHY${NC}"
        ;;
      "idle")
        echo -e "Health: ${YELLOW}💤 IDLE${NC}"
        ;;
      *)
        echo "Health: $healthStatus"
        ;;
    esac
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  📊 Metrics"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Total Requests:        $totalRequests"
    echo "Successful:            $successfulRequests"
    echo "Failed:                $failedRequests"
    echo "Success Rate:          ${successRate}%"
    
    if [ "$consecutiveFailures" -gt 0 ]; then
      echo -e "Consecutive Failures:  ${RED}$consecutiveFailures${NC}"
    else
      echo -e "Consecutive Failures:  ${GREEN}$consecutiveFailures${NC}"
    fi
    
    # Uptime
    hours=$((uptime / 3600))
    minutes=$(((uptime % 3600) / 60))
    seconds=$((uptime % 60))
    echo "Server Uptime:         ${hours}h ${minutes}m ${seconds}s"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Next update in ${INTERVAL}s... (Ctrl+C to stop)"
    
  else
    # Fallback se jq non è disponibile
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Raw response:"
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    echo ""
  fi
  
  sleep $INTERVAL
done
