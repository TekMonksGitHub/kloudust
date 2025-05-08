#!/bin/bash

# Params
# {1} VM Name - no spaces
# {2} New disk or size of exisitng disk in GB; set to empty to not add additional disk or set in-place resize for in place resizing
# {3} Disk name - must be provided if a new disk is to be added, attached or detached


NAME="{1}"
ADDITIONAL_DISK={2}
DISK_NAME={3}

function exitFailed() {
    echo Error: $1
    echo Failed
    exit 1
}

function testDiskNameProvided() {
    if [ -z $DISK_NAME ]; then exitFailed "Disk name must be provided."; fi
}

SPACE_PATTERN=" |'"
if [[ $NAME =~ $SPACE_PATTERN ]]; then 
    exitFailed "VM name $NAME can't have spaces.\n"
fi

echo Adding disk for VM $NAME for $ADDITIONAL_DISK GB additional disk

if [ -z "$ADDITIONAL_DISK" ]; then
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
fi

printf "\n\Adding disk to $NAME completed successfully.\n"
exit 0