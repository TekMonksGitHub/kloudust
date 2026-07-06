#!/bin/bash

# Params
# {1} VM Name - no spaces
# {2} New cores; set to empty to not resize the cores
# {3} New memory in MB; set to empty to not resize the memory
# {4} New disk or size of exisitng disk in GB; set to empty to not add additional disk or set in-place resize for in place resizing
# {5} Disk name - must be provided if a new disk is to be added, attached or detached
# {6} Attach disk - if true the disk name provided will be attached
# {7} Remove disk - if true the disk name provided will be removed, if set to delete it will also be physically deleted
# {8} Inplace resize - if true the disk is resized in place
# {9} Restart VM for changes to take effect (should be true, if needed)
# {10} Restart wait - time to wait for VM shutdown if needed


NAME="{1}"
CORES={2}
MEMORY={3}
ADDITIONAL_DISK={4}
DISK_NAME={5}
ATTACH_DISK={6}
REMOVE_DISK={7}
INPLACE_DISK_RESIZE={8}
RESTART={9}
SHUTDOWN_WAIT={10}
SHUTDOWN_WAIT="${SHUTDOWN_WAIT:-90}"    # Default it to 90 seconds if not provided

function exitFailed() {
    echo Error: $1
    echo Failed
    exit 1
}

function testDiskNameProvided() {
    if [ -z $DISK_NAME ]; then exitFailed "Disk name must be provided."; fi
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

SPACE_PATTERN=" |'"
if [[ $NAME =~ $SPACE_PATTERN ]]; then 
    exitFailed "VM name $NAME can't have spaces.\n"
fi

echo Resizing for VM $NAME started to $CORES cores, $MEMORY MB memory and $ADDITIONAL_DISK GB additional disk

if [ $CORES ]; then
    echo Increasing vCPUS to $CORES
    if ! virsh setvcpus $NAME $CORES --config; then exitFailed "vCPU increased failed."; fi
    if ! virsh setvcpus $NAME $CORES --current; then exitFailed "vCPU increased failed."; fi
    echo "vCPUs: resized to $CORES cores for the Virtual Machine $NAME."
fi


if [ $MEMORY ]; then
    echo Increasing memory to $MEMORY MB
    if ! virsh setmem $NAME "$MEMORY"MB --config; then exitFailed "memory increased failed."; fi
    if ! virsh setmem $NAME "$MEMORY"MB --current; then exitFailed "memory increased failed."; fi
    echo "Memory: resized to $MEMORY MB for the Virtual Machine $NAME."
fi

if [ $ADDITIONAL_DISK ] && [ "$INPLACE_DISK_RESIZE" != "true" ]; then
    testDiskNameProvided
    NUM_OF_DRIVES_MAPPED=`virsh dumpxml $NAME | grep -Pnzo "\<disk(.|\n)*?\/kloudust\/disks(.|\n)*?\<\/disk\>" | xargs --null | grep -oP "\<target.*?dev=\K'\w+'" | nl | tail -n1 | tr -s " " | xargs | cut -d" " -f1`
    if [ -z $NUM_OF_DRIVES_MAPPED ]; then exitFailed "Unable to find number of drives mapped."; fi
    DRIVE_START_LETTERS=`virsh dumpxml $NAME | grep -Pnzo "\<disk(.|\n)*?\/kloudust\/disks(.|\n)*?\<\/disk\>" | xargs --null | grep -oP "\<target.*?dev=\K'\w+'" | nl | tail -n1 | tr -s " " | xargs | cut -d" " -f2 | cut -c 1-2`
    if [ -z $NUM_OF_DRIVES_MAPPED ]; then exitFailed "Unable to parse domain XML for drive letter patterns."; fi
    ALPHABET=({a..z})
    NEXT_DRIVE_ENDDING_LETTER=`echo "${ALPHABET[$NUM_OF_DRIVES_MAPPED]}"`
    NEXT_DRIVE_NAME="$DRIVE_START_LETTERS""$NEXT_DRIVE_ENDDING_LETTER"
    DISK_FILE=/kloudust/disks/"$NAME"_"$DISK_NAME".qcow2
    echo "Drive to map is $DISK_FILE at device $NEXT_DRIVE_NAME"
    if ! qemu-img create -f qcow2 $DISK_FILE "$ADDITIONAL_DISK"G; then 
        exitFailed Disk allocation failed for $NAME for size $ADDITIONAL_DISK GB
    fi
    if ! virt-format -a $DISK_FILE --filesystem=ext4; then exitFailed "Disk initialization failed."; fi
    if ! virsh attach-disk $NAME $DISK_FILE $NEXT_DRIVE_NAME --persistent --config --subdriver qcow2; then 
        exitFailed Attachment of the new disk at $DISK_FILE to $NAME failed.
    fi
    echo "Disk: $DISK_NAME of size $ADDITIONAL_DISK GB added to the Virtual Machine $NAME."
fi

if [ "$REMOVE_DISK" == "true" ] || [ "$REMOVE_DISK" == "delete" ]; then
    testDiskNameProvided
    DISK_FILE=/kloudust/disks/"$NAME"_"$DISK_NAME".qcow2
    if ! virsh detach-disk --domain $NAME $DISK_FILE --config --persistent; then 
        exitFailed "Removal of disk $DISK_NAME from $NAME failed."
    fi
    echo "Disk: $DISK_NAME Detached Successfully."
    if [ "$REMOVE_DISK" == "delete" ]; then
        if ! rm -rf $DISK_FILE; then exitFailed "Disk $DISK_NAME deletion failed for VM $NAME."; fi
        echo "Disk: $DISK_NAME Deleted Successfully."
    fi
fi

if [ "$ATTACH_DISK" == "true" ]; then
    testDiskNameProvided
    NUM_OF_DRIVES_MAPPED=`virsh dumpxml $NAME | grep -Pnzo "\<disk(.|\n)*?\/kloudust\/disks(.|\n)*?\<\/disk\>" | xargs --null | grep -oP "\<target.*?dev=\K'\w+'" | nl | tail -n1 | tr -s " " | xargs | cut -d" " -f1`
    if [ -z $NUM_OF_DRIVES_MAPPED ]; then exitFailed "Unable to find number of drives mapped."; fi
    DRIVE_START_LETTERS=`virsh dumpxml $NAME | grep -Pnzo "\<disk(.|\n)*?\/kloudust\/disks(.|\n)*?\<\/disk\>" | xargs --null | grep -oP "\<target.*?dev=\K'\w+'" | nl | tail -n1 | tr -s " " | xargs | cut -d" " -f2 | cut -c 1-2`
    if [ -z $NUM_OF_DRIVES_MAPPED ]; then exitFailed "Unable to parse domain XML for drive letter patterns."; fi
    ALPHABET=({a..z})
    NEXT_DRIVE_ENDDING_LETTER=`echo "${ALPHABET[$NUM_OF_DRIVES_MAPPED]}"`
    NEXT_DRIVE_NAME="$DRIVE_START_LETTERS""$NEXT_DRIVE_ENDDING_LETTER"
    DISK_FILE=/kloudust/disks/"$NAME"_"$DISK_NAME".qcow2
    if ! virsh attach-disk $NAME $DISK_FILE $NEXT_DRIVE_NAME --persistent --config --subdriver qcow2; then 
        exitFailed Attachment of the disk $DISK_NAME to $NAME failed.
    fi
    echo "Disk: $DISK_NAME Attached Successfully."
fi

if [ "$INPLACE_DISK_RESIZE" == "true" ]; then
    if ! shutdownVM $NAME; then exitFailed Unable to shutdown $NAME; fi
    if [ -n "$DISK_NAME" ]; then                             # a name is given, resize that specific data disk
        EXPECTED_DISK=/kloudust/disks/"$NAME"_"$DISK_NAME".qcow2
    else                                                    # no name given, resize the primary/boot disk
        EXPECTED_DISK=/kloudust/disks/"$NAME".qcow2
    fi
    # look the disk up in the live domain XML so we only resize a disk actually attached to the VM
    VM_DISK=`virsh dumpxml $NAME | grep -oP "source\s+file='\K[^']+" | grep -Fx "$EXPECTED_DISK"`
    if [ -z "$VM_DISK" ]; then
        echo Error!! Disk $EXPECTED_DISK is not attached to $NAME.
        exitFailed
    fi
    if ! qemu-img resize $VM_DISK "$ADDITIONAL_DISK"G; then exitFailed; fi
    echo VM disk located at $VM_DISK, resized successfully.
fi


if [ "$RESTART" == "true" ]; then
    echo Restaring $NAME
    virsh reboot $NAME
fi

printf "\n\nResize of $NAME completed successfully.\n"
exit 0