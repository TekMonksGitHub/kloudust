#!/bin/bash

LOGIN="$1"
PW="$2"
HOST="$3"
HOSTKEY="$4"
PORT="$5"
FILE="$6"

cat "$FILE" | sshpass -p "$PW" ssh -T -o StrictHostKeyChecking=no -p $PORT -l "$LOGIN" $HOST
