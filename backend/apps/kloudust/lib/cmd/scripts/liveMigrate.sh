#!/bin/bash

# Params
# {1} - Domain / VM name
# {2} - The IP for the host to migrate to
# {3} - The host to migrate to admin ID
# {4} - The host to migrate to admin password

DOMAIN="{1}"
HOSTTO="{2}"
HOSTTOID="{3}"
HOSTTOPW='{4}'
HOSTTOHOSTKEY='{5}'
HOSTTOPORT='{6}'

function exitFailed() {
    echo Error: $1
    echo Failed
    exit 1
}

echo Setting up host-to networks paths
HOSTTOHOSTNAME=`sshpass -p "$HOSTTOPW" ssh -o StrictHostKeyChecking=accept-new -p $HOSTTOPORT $HOSTTOID@$HOSTTO hostname`
if [ -z $HOSTTOHOSTNAME ]; then exitFailed "Unable to detect hostname for the TO server"; fi
if ! cat /etc/hosts | grep $HOSTTOHOSTNAME; then
        echo "$HOSTTO $HOSTTOHOSTNAME" >> /etc/hosts
fi
echo Host to hostname detected and set as $HOSTTOHOSTNAME

DISKTOMIGRATE=`virsh domblklist $DOMAIN | grep qcow2|tr -s " "|xargs|cut -d" " -f2`
DISKDEVICETOMIGRATE=`virsh domblklist $DOMAIN | grep qcow2|tr -s " "|xargs|cut -d" " -f1`
DISKSIZE=`virsh domblkinfo $DOMAIN $DISKDEVICETOMIGRATE | grep -i Capacity | tr -s " " | cut -d" " -f2`
DISKSIZEGB=`echo "$DISKSIZE / 1073741824" | bc`

echo Disk information for the VM to migrate
echo DISKTOMIGRATE=$DISKTOMIGRATE
echo DISKDEVICETOMIGRATE=$DISKDEVICETOMIGRATE
echo DISKSIZE=$DISKSIZE
echo DISKSIZEGB=$DISKSIZEGB

if [ -z $DISKTOMIGRATE ]; then exitFailed "Unable to detect disk file to migrate"; fi
if [ -z $DISKDEVICETOMIGRATE ]; then exitFailed "Unable to detect disk device to migrate"; fi
if [ -z $DISKSIZE ]; then exitFailed "Unable to detect disk size to migrate"; fi
if [ -z $DISKSIZEGB ]; then exitFailed "Unable to detect disk size in GB to migrate"; fi

echo Creating remote migration disk 
if ! sshpass -p "$HOSTTOPW" ssh -o StrictHostKeyChecking=accept-new -p $HOSTTOPORT $HOSTTOID@$HOSTTOHOSTNAME qemu-img create -f qcow2 $DISKTOMIGRATE "$DISKSIZEGB"G; then 
    exitFailed "Migration disk creation failed." 
fi
CDROMDEVICE=`virsh domblklist $DOMAIN | grep cloudinit.iso | tr -s " " | xargs | cut -d" " -f1`
if [ $CDROMDEVICE ]; then 
    echo Cloudinit CDROM detect at device $CDROMDEVICE. Ejecting.
    if ! virsh change-media $DOMAIN $CDROMDEVICE --eject; then exitFailed "Cloudinit CDROM detected and failed to eject."; fi
fi

echo Starting $DOMAIN Live Migration
if ! sshpass -p "$HOSTTOPW" virsh migrate --verbose --live --unsafe --persistent --copy-storage-all --migrate-disks $DISKDEVICETOMIGRATE $DOMAIN qemu+ssh://$HOSTTOHOSTNAME:$HOSTTOPORT/system; then
    exitFailed "VM migration failed." 
fi

printf "\n\nVM migrated successfully\n"
exit 0