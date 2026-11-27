function pluginDirectory(plugin) {
  return plugin.manifest.dir || plugin.app.vault.configDir + '/plugins/' + plugin.manifest.id;
}

function nativeQuery(term, provider, plugin) {
  const query = clean(term, MAX_SELECTION);
  if (!query) throw new Error('请先输入或选中要查询的词句。');
  if (process.platform !== 'darwin') throw new Error('此入口需要 macOS。');

  const { execFile } = require('child_process');
  const encoded = encodeURIComponent(query);
  if (provider === 'youdao') {
    const helper = plugin.app.vault.adapter.getFullPath?.(pluginDirectory(plugin) + '/native/youdao-service');
    if (!helper) throw new Error('当前安装中没有可用的有道桌面接入组件。');
    return new Promise((resolve, reject) => {
      const child = execFile(helper, [], { timeout: 8000 }, error => {
        if (!error) resolve();
        else if (error.code === 3) reject(new Error('macOS 未能调用有道查词服务。可检查系统设置中的「键盘快捷键 → 服务」，或使用 Easydict、系统词典。'));
        else reject(new Error('有道桌面查询服务未响应。请打开有道翻译，或使用 Easydict、系统词典。'));
      });
      child.stdin.on('error', () => {});
      child.stdin.end(query, 'utf8');
    });
  }

  const args = provider === 'easydict'
    ? ['easydict://query?text=' + encoded]
    : ['-b', 'com.apple.Dictionary', 'dict://' + encoded];
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/open', args, { timeout: 5000 }, error => {
      if (error) {
        reject(new Error(provider === 'easydict'
          ? '没有找到 Easydict。可从右侧「设置」里的项目链接安装。'
          : '无法打开 macOS 系统词典。'));
      } else {
        resolve();
      }
    });
  });
}
