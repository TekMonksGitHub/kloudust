#!/bin/bash

RULES_JSON="{1}"  
PUBLIC_IP="{2}"  
PVT_IP="{3}"
OP="{4}"

function exitFailed() {
    echo "Failed"
    exit 1
}

if ! command -v jq &> /dev/null; then
    echo "jq not found. Installing..."
    sudo apt update && sudo apt install -y jq || exitFailed
fi

if [[ $OP == "remove" ]]; then
    ACTION="-D";
else
    ACTION="-I";
fi

echo "$RULES_JSON" | jq -c '.[]' | while read -r rule; do
    DIRECTION=$(echo "$rule" | jq -r '.direction')
    ALLOW=$(echo "$rule" | jq -r '.allow')
    PROTOCOL=$(echo "$rule" | jq -r '.protocol')
    IP=$(echo "$rule" | jq -r '.ip')
    PORT=$(echo "$rule" | jq -r '.port')

    if [[ -z "$DIRECTION" || -z "$PROTOCOL" || -z "$IP" ]]; then
        echo "Error: Missing fields in rule."
        exitFailed
    fi

    [[ "$IP" == "*" ]] && IP="0.0.0.0/0"

    PORT_OPTION=""
    if [[ "$PORT" != "*" ]]; then
        PORT_OPTION="--dport $PORT"
    fi

    TARGET="DROP"
    if [[ "$ALLOW" == "true" ]]; then
        TARGET="ACCEPT"
    fi

    if [[ "$DIRECTION" == "in" ]]; then
        FROM_IP="$IP"
        TO_IP="$PUBLIC_IP"
        
    else
        FROM_IP="$PVT_IP"
        TO_IP="$IP"
        # RULE="iptables -t raw $ACTION PREROUTING -p $PROTOCOL -s $FROM_IP -d $TO_IP $PORT_OPTION -j $TARGET"
        # CHECK_RULE="iptables -C OUTPUT -p $PROTOCOL -s $FROM_IP -d $TO_IP $PORT_OPTION -j $TARGET"
    fi

    RULE="iptables -t raw $ACTION PREROUTING -p $PROTOCOL -s $FROM_IP -d $TO_IP $PORT_OPTION -j $TARGET"
    CHECK_RULE="iptables -t raw -C PREROUTING -p $PROTOCOL -s $FROM_IP -d $TO_IP $PORT_OPTION -j $TARGET"

    if $CHECK_RULE 2>/dev/null; then
        if [[ $OP == "remove" ]]; then
            eval "$RULE" || exitFailed
        else
            echo "Rule already exists"
        fi
    else
        if [[ $OP == "apply" ]]; then
            eval "$RULE" || exitFailed
        else
            echo "Rule doesn't exist"
        fi
    fi
done

iptables-save > /etc/iptables/rules.v4 || exitFailed

echo "All firewall rules applied successfully!"
exit 0
