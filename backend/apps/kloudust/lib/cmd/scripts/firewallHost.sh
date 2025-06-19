#!/bin/bash

#########################################################################################################
# Firewalls the given host. Re-entry safe. 
# (C) 2024 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################
# Init section - check params, and assigns defaults if missing
#
# Params
# {1} ruleset The firewall ruleset
#########################################################################################################

RULESET="{1}"
EPOCH=$(date +%s)

function exitFailed() {
    echo Failed.
    exit 1
}

printf "$RULESET\n" > /kloudust/temp/nftruleset_$EPOCH.nft
if ! nft load -f /kloudust/temp/nftruleset_$EPOCH.nft; then exitFailed; fi
if ! nft list ruleset > /etc/nftables.conf; then exitFailed; fi                  # save it so it surives boot
echo Done.