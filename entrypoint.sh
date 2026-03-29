#!/bin/bash
set -euo pipefail

GOAL="${INPUT_GOAL:-}"
TOOL="${INPUT_TOOL:-copilot}"
MODEL="${INPUT_MODEL:-}"
PLAN="${INPUT_PLAN:-}"
RECIPE="${INPUT_RECIPE:-}"
MAX_RETRIES="${INPUT_MAX_RETRIES:-3}"
PR="${INPUT_PR:-review}"

CMD="node /app/dist/src/cli.js"

if [ -n "$RECIPE" ]; then
  CMD="$CMD use $RECIPE --tool $TOOL --max-retries $MAX_RETRIES --pr $PR"
elif [ -n "$PLAN" ]; then
  CMD="$CMD swarm $PLAN --tool $TOOL --max-retries $MAX_RETRIES --pr $PR"
elif [ -n "$GOAL" ]; then
  CMD="$CMD run --goal \"$GOAL\" --tool $TOOL --max-retries $MAX_RETRIES --pr $PR"
else
  echo "Error: one of goal, plan, or recipe must be provided"
  exit 1
fi

if [ -n "$MODEL" ]; then
  CMD="$CMD --model $MODEL"
fi

echo "Running: $CMD"
eval $CMD

if [ -f "/tmp/swarm-result.json" ]; then
  echo "result=$(cat /tmp/swarm-result.json)" >> "$GITHUB_OUTPUT"
fi

if [ -f "/tmp/swarm-plan.json" ]; then
  echo "plan-path=/tmp/swarm-plan.json" >> "$GITHUB_OUTPUT"
fi

if [ -f "/tmp/swarm-pr-url.txt" ]; then
  echo "pr-url=$(cat /tmp/swarm-pr-url.txt)" >> "$GITHUB_OUTPUT"
fi
