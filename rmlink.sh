#!/bin/bash
APP_DIR="$( cd "$( dirname "$0" )" && pwd )"
if [ "$1" == "" ]; then
	echo Usage: $0 [name of the application]
	exit 1
fi
APPNAME="$1"

rm $APP_DIR/backend/apps/kloudust/3p/$APPNAME

echo Done.
