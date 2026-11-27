# 词屿离线词库

本目录包含从 [ECDICT 基础词库](https://github.com/skywind3000/ECDICT) 提取的三份 UTF-8 JSON。ECDICT 使用 [MIT License](https://github.com/skywind3000/ECDICT/blob/master/LICENSE)。词集按该项目的标签和词频整理，四六级标签为 ECDICT 的分类。

| 文件 | 收录规则 | 词条数 |
|---|---|---:|
| common.json | 有中文释义且 BNC 或当代语料词频排名在前 24,000 | 27,466 |
| cet4.json | ECDICT cet4 标签，并有中文释义 | 3,846 |
| cet6.json | ECDICT cet6 标签，并有中文释义 | 5,406 |

每个词条形如「词 → [音标, 中文释义, 词形]」。中文释义保留最多五行。三个集合有重叠。相关版权和许可见安装包的 THIRD-PARTY-NOTICES.txt。

用于生成本次词集的 ecdict.csv SHA-256：
d1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc

若修改数据源，可用 scripts/prepare-dictionaries.py 重新生成。
