import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const versionFilePath = path.join(__dirname, '..', 'src', 'shared', 'constants', 'version.ts');
const packageJsonPath = path.join(__dirname, '..', 'package.json');

function bumpVersion() {
  try {
    // 1. Atualizar version.ts
    const content = fs.readFileSync(versionFilePath, 'utf8');
    const match = content.match(/export const APP_VERSION = "(\d+\.\d+)";/);

    if (!match) {
      console.error("Não foi possível encontrar a versão no formato esperado em version.ts.");
      process.exit(1);
    }

    const currentVersionStr = match[1];
    const [major, minor] = currentVersionStr.split('.').map(Number);
    
    // Incrementa a parte minor
    const nextVersion = `${major}.${minor + 1}`;

    const newContent = content.replace(
      `export const APP_VERSION = "${currentVersionStr}";`,
      `export const APP_VERSION = "${nextVersion}";`
    );

    fs.writeFileSync(versionFilePath, newContent);

    // 2. Atualizar package.json
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      // Converte "1.22" para "1.22.0" para seguir o semver do package.json
      pkg.version = `${nextVersion}.0`;
      fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log(`package.json atualizado para a versão ${pkg.version}`);
    }

    console.log(JSON.stringify({
      oldVersion: currentVersionStr,
      newVersion: nextVersion,
      packageVersion: `${nextVersion}.0`
    }));
  } catch (error) {
    console.error("Erro ao processar versão:", error);
    process.exit(1);
  }
}

bumpVersion();
