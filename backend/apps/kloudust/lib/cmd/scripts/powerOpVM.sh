#!/bin/bash

# Params
# {1} - Domain / VM name
# {2} - The operation to perform

NAME="{1}"
POWER_OP="{2}"
VLAN_ID="{3}"

function exitFailed() {
    echo Failed
    exit 1
}

printf "Power operating $NAME to $POWER_OP\n"
if ! virsh $POWER_OP $NAME; then exitFailed; fi

VNET_IFACE=$(virsh domiflist "$NAME" | awk 'NR==3 {print $1}')

if [[ -n "$VNET_IFACE" ]]; then
    echo "Configuring VLAN for $VNET_IFACE..."
    bridge vlan del dev $VNET_IFACE vid 1
    bridge vlan add dev $VNET_IFACE vid $VLAN_ID pvid untagged
else
    echo "Failed to detect vnet interface for VM."
    exit 1
fi

printf "\n\nPower operation $POWER_OP successful on $NAME\n"
exit 0
