"use strict";

const fs = require("fs");
const path = require("path");
const ResEdit = require("resedit");

function applyIconAndVersion(exePath, icoPath, { productName, version }) {
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
  const res = ResEdit.NtExecutableResource.from(exe);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
  const iconData = iconFile.icons.map((item) => item.data);
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  if (groups.length === 0) {
    throw new Error(`Nenhum grupo de ícone em ${exePath}`);
  }
  for (const group of groups) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
      res.entries,
      group.id,
      group.lang,
      iconData
    );
  }

  const versions = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  if (versions.length === 1) {
    const languages = versions[0].getAllLanguagesForStringValues();
    const lang = languages[0] || { lang: 1033, codepage: 1200 };
    versions[0].setStringValues(lang, {
      FileDescription: productName,
      ProductName: productName,
      InternalName: productName,
      OriginalFilename: `${productName}.exe`,
      CompanyName: productName,
      ProductVersion: version,
      FileVersion: version,
    });
    versions[0].outputToResourceEntries(res.entries);
  }

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
}

exports.applyIconAndVersion = applyIconAndVersion;

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;
  const productName = context.packager.appInfo.productFilename;
  const exePath = path.join(context.appOutDir, `${productName}.exe`);
  const icoPath = path.join(__dirname, "icon.ico");
  applyIconAndVersion(exePath, icoPath, {
    productName,
    version: context.packager.appInfo.version,
  });
};
