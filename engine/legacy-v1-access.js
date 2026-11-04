'use strict';

const fs = require('node:fs');
const path = require('node:path');

function isWithinRoot(targetPath, rootPath) {
  const relative = path.relative(rootPath, targetPath);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

function canonicalExternalFile(value, description, engineDir) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new Error('Legacy V1 ' + description + ' path must be absolute and outside the source repository.');
  }

  // realpath closes the symlink path back into tracked repository data.
  const file = fs.realpathSync(value);
  const sourceRoot = fs.realpathSync(path.resolve(engineDir, '..'));
  if (isWithinRoot(file, sourceRoot)) {
    throw new Error('Legacy V1 ' + description + ' path must be outside the source repository.');
  }
  const stat = fs.statSync(file);
  if (!stat.isFile()) {
    throw new Error('Legacy V1 ' + description + ' path must refer to an existing file.');
  }
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
    throw new Error('Legacy V1 ' + description + ' file must not be readable by group or others.');
  }
  return file;
}

function admitLegacyV1(env, engineDir) {
  if (env.ASSET_FACTORY_ENABLE_LEGACY_V1_SERVER !== 'true' ||
      !['development', 'test'].includes(env.NODE_ENV)) {
    throw new Error('Legacy V1 server is disabled by default; explicit local-only test opt-in is required.');
  }
  return {
    usersPath: canonicalExternalFile(env.ASSET_FACTORY_LEGACY_V1_USERS_FILE, 'users', engineDir),
    dbPath: canonicalExternalFile(env.ASSET_FACTORY_LEGACY_V1_DB_FILE, 'database', engineDir),
  };
}

function requireLegacyOwner(user) {
  if (!user || typeof user.id !== 'string' || !user.id.trim()) {
    throw new Error('Legacy V1 requests require a nonblank authenticated owner.');
  }
  return user.id;
}

function ownsLegacyJob(job, user) {
  return !!job && typeof job.ownerUserId === 'string' && !!job.ownerUserId.trim() &&
    typeof user?.id === 'string' && !!user.id.trim() && job.ownerUserId === user.id;
}

module.exports = { admitLegacyV1, requireLegacyOwner, ownsLegacyJob };
