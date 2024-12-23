/** 
 * deleteS3storageBucket.js - Deletes the given s3 storage bucket.
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const { xforge } = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const hostchooser = require(`${KLOUD_CONSTANTS.LIBDIR}/hostchooser.js`);
const crypt = require(`${CONSTANTS.LIBDIR}/crypt.js`);
const Minio = require('minio');

module.exports.exec = async function (params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) { params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }
    const bucket_name_raw = params[0];
    const bucket_name = exports.resolveBucketName(bucket_name_raw);

    const bucket = await dbAbstractor.getS3storageBucket(bucket_name);
    if (!bucket) { params.consoleHandlers.LOGERROR("Bad bucket name or bucket not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const hostInfo = await hostchooser.getHostFor();
    if (!hostInfo) { params.consoleHandlers.LOGERROR("Unable to find a suitable host."); return CMD_CONSTANTS.FALSE_RESULT(); }

    const isBucketDeleted = await deleteBucket(bucket_name_raw, hostInfo);

    if (!isBucketDeleted.result) {
        const error = `Error in deleting bucket ${isBucketDeleted.error}`;
        params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error);
    }

    const removeMinioUserPolicy = await _removeMinioUserPolicy(bucket_name, params, hostInfo);
    if (!removeMinioUserPolicy.result) {
        const error = `Error in removing bucket user policy for ${KLOUD_CONSTANTS.env.userid}.`;
        params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error);
    }
    else {
        if (await dbAbstractor.deleteS3storageBucket(bucket_name)) return isBucketDeleted;
        else { params.consoleHandlers.LOGERROR("DB failed"); return { ...isBucketDeleted, result: false }; }
    }
}

const deleteBucket = async (bucket_name_raw, hostInfo) => {
    const minioClient = new Minio.Client({
        endPoint: hostInfo.hostaddress,
        port: KLOUD_CONSTANTS.S3DOCKERCONF.S3STORAGE_DEFAULT_PORT,
        useSSL: false,
        accessKey: crypt.decrypt(KLOUD_CONSTANTS.S3DOCKERCONF.MINIO_ROOT_USER),
        secretKey: crypt.decrypt(KLOUD_CONSTANTS.S3DOCKERCONF.MINIO_ROOT_PASSWORD)
    });

    try {
        await minioClient.removeBucket(bucket_name_raw)
        LOG.info(`${bucket_name_raw} Bucket removed successfully`);
        return { result: true, msg: 'Bucket removed successfully' };
    } catch (error) {
        LOG.error('Error removing bucket:', error.message);
        LOG.error(error);
        return { result: false, error: error };
    }
}

const _removeMinioUserPolicy = async (bucket_name, params, hostInfo) => {
    const xforgeArgs = {
      colors: KLOUD_CONSTANTS.COLORED_OUT,
      file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
      console: params.consoleHandlers,
      other: [
        hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
        `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/removeMinioUserPolicy.sh`, KLOUD_CONSTANTS.env.userid, bucket_name, crypt.decrypt(KLOUD_CONSTANTS.S3DOCKERCONF.MINIO_ROOT_USER), crypt.decrypt(KLOUD_CONSTANTS.S3DOCKERCONF.MINIO_ROOT_PASSWORD), KLOUD_CONSTANTS.S3DOCKERCONF.S3STORAGE_DEFAULT_PORT, KLOUD_CONSTANTS.S3DOCKERCONF.DOCKER_VM_PARAM.VM_NAME
      ]
    }
    const results = await xforge(xforgeArgs);
    return results;
  }

exports.resolveBucketName = bucket_name_raw => bucket_name_raw ? `${bucket_name_raw}_${KLOUD_CONSTANTS.env.org}_${KLOUD_CONSTANTS.env.prj}`.toLowerCase().replace(/\s/g, "_") : null;