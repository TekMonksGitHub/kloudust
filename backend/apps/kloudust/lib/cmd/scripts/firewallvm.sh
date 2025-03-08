#!/bin/bash

ACTION="{1}"         
PROTOCOL="{2}"       
DIRECTION="{3}"     
FROM_IP="{4}"        
TO_IP="{5}"          
PORT="{6}"          

if [[ "$DIRECTION" != "in" && "$DIRECTION" != "out" ]]; then
    echo "Error: Direction must be 'in' or 'out'"
    usage
fi

if [[ "$ACTION" != "allow" && "$ACTION" != "deny" ]]; then
    echo "Error: Action must be 'allow' or 'deny'"
    usage
fi

if [[ "$PROTOCOL" != "tcp" && "$PROTOCOL" != "udp" ]]; then
    echo "Error: Protocol must be 'tcp' or 'udp'"
    usage
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
    echo "Error: Port must be a number."
    usage
fi


if [[ "$ACTION" == "allow" ]]; then
    ACTION_FLAG="-A"
    TARGET="ACCEPT"
else
    ACTION_FLAG="-A"
    TARGET="DROP"
fi

if [[ "$DIRECTION" == "in" ]]; then
    RULE="iptables -t raw $ACTION_FLAG PREROUTING -p $PROTOCOL -s $FROM_IP --dport $PORT -d $TO_IP -j $TARGET"
else
    RULE="iptables $ACTION_FLAG OUTPUT -p $PROTOCOL -s $FROM_IP --dport $PORT -d $TO_IP -j $TARGET"
fi

echo "Applying rule: $RULE"
$RULE

iptables-save > /etc/iptables/rules.v4

echo "Firewall rule applied successfully!"
exit 0