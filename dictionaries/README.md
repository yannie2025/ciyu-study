# 词屿离线词库

本目录包含从 [ECDICT 基础词库](https://github.com/skywind3000/ECDICT) 提取的八份 UTF-8 JSON。ECDICT 使用 [MIT License](https://github.com/skywind3000/ECDICT/blob/master/LICENSE)。词集按该项目的官方标签和词频整理。

| 文件 | 收录规则 | 词条数 |
|---|---|---:|
| common.json | 有中文释义且 BNC 或当代语料词频排名在前 24,000 | 27,466 |
| cet4.json | ECDICT `cet4` 标签，并有中文释义 | 3,846 |
| cet6.json | ECDICT `cet6` 标签，并有中文释义 | 5,406 |
| ky.json | ECDICT `ky`（考研英语）标签，并有中文释义 | 4,801 |
| ielts.json | ECDICT `ielts`（雅思）标签，并有中文释义 | 5,040 |
| toefl.json | ECDICT `toefl`（托福）标签，并有中文释义 | 6,974 |
| gre.json | ECDICT `gre`（GRE 核心）标签，并有中文释义 | 7,504 |
| gk.json | ECDICT `gk`（高考英语）标签，并有中文释义 | 3,674 |

每个词条形如「词 → [音标, 中文释义, 词形]」。中文释义保留最多五行。各词库可能收录相同词条。相关版权和许可见安装包的 THIRD-PARTY-NOTICES.txt。

用于生成本次词集的 ecdict.csv SHA-256：
d1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc

若修改数据源，可用 scripts/prepare-dictionaries.py 重新生成。
