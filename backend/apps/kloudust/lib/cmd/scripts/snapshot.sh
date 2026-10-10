#!/bin/bash

# Params
# $VM_NAME The VM name
# $SNAPSHOT_NAME The snapshot name

VM_NAME={1}
SNAPSHOT_NAME={2}

function exitFailed() {
    sudo rm -rf /kloudust/snapshots/$VM_NAME.$SNAPSHOT_NAME.timestamp
    sudo rm -rf /kloudust/snapshots/$VM_NAME.$SNAPSHOT_NAME.*.qcow2
    echo Failed
    exit 1
}

if sudo ls /kloudust/snapshots/$VM_NAME.$SNAPSHOT_NAME.disk.qcow2; then 
    echo Error: Snapshot $SNAPSHOT_NAME for VM $VM_NAME already exists.
    echo Failed; exit 1
fi

TIMESTAMP=`date +%s%N | cut -b1-13`
UTC_DATE=`date -u`
STATE=`virsh domstate $VM_NAME`
DISKS=`virsh domblklist $VM_NAME --details | awk '$2=="disk" {print $3, $4}'`

if [ -z "$DISKS" ]; then 
    echo Unable to locate VM disk
    exitFailed
fi
printf "Disks located:\n$DISKS\n"

if [ "$STATE" != "shut off" ]; then
    printf "\n\nSnapshotting $VM_NAME to image named $SNAPSHOT_NAME\n"
    SPECS=""; while read T F; do SPECS="$SPECS --diskspec $T,file=${F%.*}.overlay_$TIMESTAMP,snapshot=external"; done <<< "$DISKS"
    if ! virsh snapshot-create-as --no-metadata --domain $VM_NAME $SNAPSHOT_NAME $SPECS --disk-only --atomic; then exitFailed; fi
fi

printf "\n\nAdding additional snapshot metadata\n"
sudo echo $TIMESTAMP > /kloudust/snapshots/$VM_NAME.$SNAPSHOT_NAME.timestamp
sudo echo UTC Date: $UTC_DATE >> /kloudust/snapshots/$VM_NAME.$SNAPSHOT_NAME.timestamp

printf "\n\nCopying disks to the snapshot\n"
FAILED=0
while read T F; do
    S=/kloudust/snapshots/$VM_NAME.$SNAPSHOT_NAME.`basename ${F%.*}`.qcow2
    if [[ $F == /kloudust/disks/$VM_NAME.* ]]; then S=/kloudust/snapshots/$VM_NAME.$SNAPSHOT_NAME.disk.qcow2; fi
    echo Copying $F to $S
    if [ $FAILED == 0 ] && ! qemu-img convert -U -O qcow2 $F $S; then FAILED=1; sudo rm -f $S; fi
    if [ "$STATE" != "shut off" ]; then
        if virsh blockcommit $VM_NAME $T --active --pivot --verbose --wait; then sudo rm -f ${F%.*}.overlay_$TIMESTAMP; else FAILED=1; fi
    fi
done <<< "$DISKS"
if [ $FAILED == 1 ]; then exitFailed; fi

printf "\n\nSnapshot successful\n"
exit 0
