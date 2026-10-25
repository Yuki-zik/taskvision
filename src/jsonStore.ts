// REUSE: 旧 sidecar 写入统一通过临时文件与 rename；新协作租约使用独立事务存储。 [tv:id=reuse.atomic-json]

import * as fs from 'fs';
import * as path from 'path';

function ensureFolder(folderPath: string) {
  if (!folderPath) {
    return;
  }

  if (fs.existsSync(folderPath) !== true) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
}

function createUniquePath(basePath: string) {
  if (fs.existsSync(basePath) !== true) {
    return basePath;
  }

  let index = 1;
  let candidate = basePath + '.' + index;
  while (fs.existsSync(candidate) === true) {
    index += 1;
    candidate = basePath + '.' + index;
  }

  return candidate;
}

function backupMalformedJson(filePath?: string) {
  if (!filePath || fs.existsSync(filePath) !== true) {
    return undefined;
  }

  const backupPath = createUniquePath(filePath + '.invalid');
  fs.renameSync(filePath, backupPath);
  return backupPath;
}

function readJsonFile(filePath?: string): unknown {
  if (!filePath || fs.existsSync(filePath) !== true) {
    return undefined;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    backupMalformedJson(filePath);
    return undefined;
  }
}

function createTempPath(filePath: string) {
  return path.join(
    path.dirname(filePath),
    '.' +
      path.basename(filePath) +
      '.tmp-' +
      process.pid +
      '-' +
      Date.now() +
      '-' +
      Math.random().toString(16).slice(2),
  );
}

function writeTextFile(filePath: string | undefined, text: string) {
  if (!filePath) {
    return undefined;
  }

  ensureFolder(path.dirname(filePath));
  const tempPath = createTempPath(filePath);

  try {
    fs.writeFileSync(tempPath, text);
    fs.renameSync(tempPath, filePath);
  } catch (e) {
    if (fs.existsSync(tempPath) === true) {
      fs.unlinkSync(tempPath);
    }
    throw e;
  }

  return filePath;
}

function writeJsonFile(filePath: string | undefined, value: unknown) {
  if (!filePath) {
    return undefined;
  }

  return writeTextFile(filePath, JSON.stringify(value, null, 2) + '\n');
}

export { readJsonFile, writeJsonFile, writeTextFile, backupMalformedJson };
