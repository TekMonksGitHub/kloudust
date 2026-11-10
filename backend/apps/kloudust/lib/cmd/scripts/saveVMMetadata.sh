#!/bin/bash

# Params
# {1} VM Name
# {2} Space separated names of the VM's detached disks, as recorded in the DB

NAME="{1}"
DETACHED="{2}"
META=/kloudust/metadata/$NAME

function diskSizeGB() {
    local BYTES=`qemu-img info -U $1 2>/dev/null | grep -oP '^virtual size:.*\(\K[0-9]+'`
    echo $((${BYTES:-0}/1073741824))
}

XML=`virsh dumpxml --inactive $NAME`
if [ -z "$XML" ]; then echo "Error: unable to read the config of VM $NAME."; echo Failed; exit 1; fi
echo "$XML" > $META.xml

if [ -f $META.metadata ]; then
    DATA_DISKS=""
    for F in `grep -oP "source\s+file='\K/kloudust/disks/${NAME}_[^']+\.qcow2" <<< "$XML"`; do
        DISK=${F#/kloudust/disks/${NAME}_}; DISK=${DISK%.qcow2}
        DATA_DISKS="$DATA_DISKS $DISK:`diskSizeGB $F`:attached"
    done
    for DISK in $DETACHED; do
        F=/kloudust/disks/${NAME}_$DISK.qcow2
        if [ -f $F ] && ! grep -qF "'$F'" <<< "$XML"; then DATA_DISKS="$DATA_DISKS $DISK:`diskSizeGB $F`:detached"; fi
    done
    sed -i -e "s/^VCPUS=.*/VCPUS=`virsh vcpucount $NAME --active --config`/" \
        -e "s/^\(MEMORY\|RAM\)=.*/\1=$((`grep -oP "<currentMemory unit='KiB'>\K[0-9]+" <<< "$XML"`/1024))/" \
        -e "s/^DISK_SIZE=.*/DISK_SIZE=`diskSizeGB /kloudust/disks/$NAME.qcow2`/" \
        -e '/^DATA_DISKS=/d' $META.metadata
    echo "DATA_DISKS=\"${DATA_DISKS# }\"" >> $META.metadata
fi

echo "Metadata for $NAME saved."
exit 0
