#!/bin/bash

#########################################################################################################
# Adds or modifies existing VxLAN for the host. Re-entry safe. 
# (C) 2024 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################
# Init section - check params, and assigns defaults if missing
#
# Params
# {1} VLAN Name
# {2} VLAN ID (it is a number)
# {3} Peer host IPs as a list eg "192.168.1.1 192.168.1.2 ..."
# {5} Default ethernet device for VxLAN VTEP which routes VxLAN traffic between the hosts. Optional.
# {6} The MTU for the default ethernet - default is 1500 as it works everywhere usually. Optional.
#########################################################################################################
VLAN_NAME={1}
VLAN_ID={2}
PEER_HOSTS={3}
DEFAULT_ETH={5}
DEFAULT_ETH_MTU={6}

BR_NAME="$VLAN_NAME"_br
DEFAULT_BR_VLAN_ID=10                                                            # Not really used

SCRIPT_PATH=$(readlink -f "$0")
VXLAN_BOOT_SCRIPT=/kloudust/system/10vxlan_"$VLAN_NAME".sh

echoerr() { echo "$@" 1>&2; }

function exitFailed() {
    echo Failed.
    rm $VXLAN_BOOT_SCRIPT
    exit 1
}

printf "#!/bin/bash\n\n" > $VXLAN_BOOT_SCRIPT
if [ -z "$DEFAULT_ETH" ] || [ "$DEFAULT_ETH" == "auto" ]; then                   # Assume default ethernet is the local VTEP if not given
    DEFAULT_ETH=`ip route | grep default | grep -o 'dev.*' | cut -d" " -f2`
    echo Located default ethernet for VxLAN at $DEFAULT_ETH
fi

if [ -z "$DEFAULT_ETH" ] || [ "$DEFAULT_ETH" == "auto" ]; then 
    echoerr "Could not locate default ethernet for VxLAN host VTEP"
    exitFailed
fi
DEFAULT_ETH_MTU=${DEFAULT_ETH_MTU:=1500}                                         # default the MTU if needed
if ! ip link set mtu $DEFAULT_ETH_MTU dev $DEFAULT_ETH; then exitFailed; fi      # set the default MTU on the base interface
echo "MTU set for $DEFAULT_ETH to $DEFAULT_ETH_MTU"

#########################################################################################################
# This section creates the VxLAN tunnel and VTEPs and the bridge for the VLAN - this essentially cables
# the virtual network and this is the only important step. Rest should work if this works.
#########################################################################################################
if [ ! "`ip link | grep "$VLAN_NAME":`" ]; then                                  # this creates the VxLAN to match VLAN name 
    if ! ip link add $VLAN_NAME type vxlan id $VLAN_ID dev $DEFAULT_ETH dstport 0; then exitFailed; fi 	
    echo Created a new VxLAN $VLAN_NAME with ID $VLAN_ID and VTeP $DEFAULT_ETH
else
    echo Skipped creating VxLAN $VLAN_NAME as it already exists
fi
if [ -n "$PEER_HOSTS" ]; then 
	for PEER_HOST in $PEER_HOSTS; do                                             # VxLAN unicast to the VTEPs
        if ! bridge fdb append to 00:00:00:00:00:00 dst $PEER_HOST dev $VLAN_NAME; then exitFailed; fi   
        echo Added VTeP peering $DEFAULT_ETH '->' $PEER_HOST for VxLAN $VLAN_NAME
    done 
fi

if [ ! "`ip link | grep "$BR_NAME":`" ]; then                                    # creates the default VLAN bridge if it doesn't exist
    if ! ip link add $BR_NAME type bridge vlan_filtering 1; then exitFailed; fi  # Create a new bridge to connect all VLAN participants
    if ! ip link set $VLAN_NAME master $BR_NAME; then exitFailed; fi             # Adds the VxLAN VTEP to the bridge - L2 tunnel 
    echo Created a new bridge $BR_NAME
else
    echo Skipped creating a new bridge $BR_NAME as it already exists
fi

if ! ip link set up dev $VLAN_NAME; then exitFailed; fi                          # Bring the VxLAN up
if ! ip link set up dev $BR_NAME; then exitFailed; fi                            # Bring the Bridge up
echo Brought up VxLAN $VLAN_NAME and bridge $BR_NAME

cp $SCRIPT_PATH $VXLAN_BOOT_SCRIPT                                               # Ensure we survive a boot
echo Done.