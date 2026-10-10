#!/bin/bash


function exitFailed() {
    echo Failed
    exit 1
}

printf "\n\nDeleting snapshot {2} for {1}\n"
if ! sudo rm -rf /kloudust/snapshots/{1}.{2}.*.qcow2; then exitFailed; fi
if ! sudo rm -rf /kloudust/snapshots/{1}.{2}.timestamp; then exitFailed; fi

printf "\n\nVM snapshot deleted successfully\n"
exit 0
