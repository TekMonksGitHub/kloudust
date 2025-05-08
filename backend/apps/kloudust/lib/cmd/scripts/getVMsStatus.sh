#!/bin/bash

# Params
# {1} The list of VMs

VMS="{1}"

IFS='|'

read -ra SPLITTED_VMS <<< "${VMS}"

OUTPUT="";
for val in "${SPLITTED_VMS[@]}"; do
    IFS=',' read -ra SPLITTED_VM <<< "$val"
    state=$(virsh domstate "${SPLITTED_VM[0]}") 
    OUTPUT+="${SPLITTED_VM[0]},${SPLITTED_VM[1]},${state}|" 
done

echo "OUTPUTSTART ${OUTPUT} OUTPUTEND";