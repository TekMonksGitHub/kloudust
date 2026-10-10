#!/bin/bash

# Params
# {1} - VM Name
# {2} - Snapshot Name
# {3} - Start VM post restore automatically if {3} == restart
# {4} - VM graceful shutdown timeout, optional, in seconds

VM_NAME="{1}"
SNAPSHOT_NAME="{2}"
RESTART_VM={3}
SHUTDOWN_WAIT={4}
SHUTDOWN_WAIT="${SHUTDOWN_WAIT:-90}"    # Default it to 90 seconds if not provided

function exitFailed() {
    echo Failed
    exit 1
}

function waitProcessKilled() {
    PID=$1
    TIME_TO_WAIT=$2

    WAITED_SO_FAR=0
    while [ $WAITED_SO_FAR -lt $TIME_TO_WAIT ]; do
        ps --pid $PID
        if [ "$?" == "1" ]; then return 0; 
        else 
            sleep 5
            WAITED_SO_FAR=$(($WAITED_SO_FAR+5))
        fi
    done
    return 1
}

function shutdownVM() {
    VMNAME=$1
    VMPID=`ps ax | grep $VMNAME | grep kvm | tr -s " " | xargs  | cut -d" " -f1`
    if ! virsh shutdown $VMNAME; then exitFailed; fi
    waitProcessKilled $VMPID $SHUTDOWN_WAIT
    if [ "$?" == "1" ]; then  
        echo VM graceful shutdown timed out for $VMNAME after waiting $SHUTDOWN_WAIT seconds, destroying it instead. 
        if ! virsh destroy $VMNAME; then 
            echo VM destroy failed as well for $VMNAME.
            return 1
        else
            echo VM $VMNAME was shutdown via forced destroy.
        fi
    else
        echo Warning!! VM $VMNAME was shutdown gracefully.
    fi
    return 0
}

function nextFreeDevice() {
    local XML=`virsh dumpxml $VM_NAME`
    local PREFIX=`echo "$XML" | grep -Pzo "<disk(.|\n)*?/kloudust/disks(.|\n)*?</disk>" | tr '\0' '\n' | grep -oP "<target.*?dev='\K[a-z][a-z]" | head -n1`
    local USED=`echo "$XML" | grep -Pzo "<disk(.|\n)*?</disk>" | tr '\0' '\n' | grep -oP "<target.*?dev='\K\w+"`
    if [ -z "$PREFIX" ]; then return; fi
    for L in {a..z}; do grep -qx "$PREFIX$L" <<< "$USED" || { echo "$PREFIX$L"; return; }; done
}

if ! sudo ls /kloudust/snapshots/$VM_NAME.$SNAPSHOT_NAME.disk.qcow2; then 
    echo Error: Snapshot $SNAPSHOT_NAME for the VM $VM_NAME does not exist.
    exitFailed
fi

TIMESTAMP=`date +%s%N | cut -b1-13`
SNAPSHOT_DISK=/kloudust/snapshots/$VM_NAME.$SNAPSHOT_NAME.disk.qcow2
OLD_DISK=`virsh domblklist $VM_NAME | awk -v p="/kloudust/disks/$VM_NAME." 'index($2,p)==1 {print $2; exit}'`
DATA_DISKS=`ls /kloudust/snapshots/$VM_NAME.$SNAPSHOT_NAME.*.qcow2 | grep -vxF $SNAPSHOT_DISK | sed "s|^/kloudust/snapshots/$VM_NAME.$SNAPSHOT_NAME.||"`
NEW_DISK=/kloudust/disks/$VM_NAME.qcow2

if [ -z "$OLD_DISK" ]; then 
    echo Error: Unable to locate source disk for $VM_NAME. Quitting.
    exitFailed
fi

printf "\n\nShutting down VM $VM_NAME\n"
if [ "`virsh domstate $VM_NAME`" != "shut off" ] && ! shutdownVM $VM_NAME; then exitFailed; fi

printf "\n\nRestoring snapshot $SNAPSHOT_NAME to $VM_NAME\n"
if ! virt-xml $VM_NAME --edit source.file=$OLD_DISK --disk source.file=$NEW_DISK; then exitFailed; fi
if ! sudo rm -rf $OLD_DISK; then exitFailed; fi
if ! sudo cp -f $SNAPSHOT_DISK $NEW_DISK; then exitFailed; fi
for D in $DATA_DISKS; do
    if ! sudo cp -f /kloudust/snapshots/$VM_NAME.$SNAPSHOT_NAME.$D /kloudust/disks/$D; then exitFailed; fi
    if virsh domblklist $VM_NAME | awk -v d=/kloudust/disks/$D '$2==d {f=1} END {exit !f}'; then continue; fi
    if ! virsh attach-disk $VM_NAME /kloudust/disks/$D `nextFreeDevice` --persistent --config --subdriver qcow2; then exitFailed; fi
done

if [ "$RESTART_VM" == "restart" ]; then
    printf "\n\nRestarting VM $VM_NAME\n"
    if ! virsh start $VM_NAME --force-boot; then exitFailed; fi
fi


printf "\n\nVM restored successfully\n"
exit 0