#!/bin/bash

# Params
# {1} VM Name - no spaces

NAME="{1}"

function exitFailed() {
    echo Failed
    exit 1
}

SPACE_PATTERN=" |'"
if [[ $NAME =~ $SPACE_PATTERN ]]; then 
    printf "VM name $NAME can't have spaces.\n"
    exitFailed
fi

if virsh list | grep $NAME; then
    printf "Power operating $NAME to force shut\n"
    if ! virsh destroy $NAME; then exitFailed; fi
fi

printf "WARNING!! VM $NAME will be deleted permanently at the end of this operation.\n"

VM_DISKS=(`virsh dumpxml $NAME | grep -oP "source\sfile=\s*'\K\/kloudust\/disks\/$NAME.+?(?=')"`)
if [ -z $VM_DISKS ]; then
    echo Error!! Unable to find VM disk. 
    exitFailed
fi
echo VM disks located at ${VM_DISKS[*]}.

printf "\n\nDeleting $NAME\n"
EPOCH=`date +%s`
if ! virsh undefine $NAME --nvram; then exitFailed; fi
for VM_DISK in "${VM_DISKS[@]}"; do
    DISK_THIS=`echo $VM_DISK | grep -Po "$NAME.*"`
    if ! mv $VM_DISK /kloudust/recyclebin/$DISK_THIS.$EPOCH.qcow2; then echo Failed to move the vm disk to recyclebin; fi
done
if ! mv /kloudust/metadata/$NAME.xml /kloudust/recyclebin/$NAME.$EPOCH.xml; then echo Failed to move the vm xml to recyclebin; fi
if ! mv /kloudust/metadata/$NAME.metadata /kloudust/recyclebin/$NAME.$EPOCH.metadata; then echo Failed to move the vm metadata to recyclebin; fi

printf "\n\nVM $NAME deleted successfully\n"
exit 0
