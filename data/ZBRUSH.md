<!--
【マインドマップ 編集フォーマット】
─────────────────────────────────────
# ルートノード（1つだけ）
## 第1層ノード
### 第2層ノード
#### 以降、# を増やして階層を深める（最大6段階）
- ハイフン行 = メモ・補足（ノードの子として小さく表示）
[テキスト](URL) = リンク付きノード（見出しに埋め込む）
─────────────────────────────────────
AIに渡すとき: 「このフォーマットに従って以下の内容を整理して」と伝える
-->

# [【ZBRUSH】](https://pixologic.jp/)

## [flee style](https://pin.it/1Jd51Rk)
### [hi poly](https://pin.it/1rsmnIg)
#### [dinamesh](https://pixologic.jp/project/dynamesh/)
- PolyGroupIt
##### [project primitive](https://mononoco.com/creative-design/zbrush/project-primitive)
- MeshBoolean (mask)
###### poly paint
- [zbrush to photoshop](https://www.youtube.com/watch?v=cw4F75CcRGg)
  - concept model..
  - design..
  - 3D_illustration..

#### [Live Boolean](https://your-3d.com/zbrush-liveboolean/)
##### [spotlight 3D](https://www.youtube.com/watch?v=51UhAalqw84)
###### alpha
- from mesh
- make boolean mesh

#### [decimation](https://mononoco.com/creative-design/zbrush/decimation-master)
##### [sculptris](https://kizakiaoi.wordpress.com/2019/12/25/zbrush_sculptrispro/)
- chisel & BevelArc も使用可になった
###### [uv master (game)](https://pin.it/5ehCBcJ)
- import (reUV): .obj, fbx,..
- [multi map exporter](https://modelinghappy.com/archives/136)
  - もしくわ hi poly を .spp で low poly にベイク
  - export: .tiff, .png → .spp

## [animation](https://www.youtube.com/watch?v=YnoyBuMQZKY)
### [low poly](https://pin.it/3EGJ6uM)
#### [initialize](https://3dtotal.jp/tutorials/7041/)
##### [zmodeler](https://www.youtube.com/watch?v=EZ09c6-EGfo&t=1418s)
- extender
###### [dynamic](https://www.youtube.com/watch?v=Utj7ztVxrXs)
- [crease](https://www.ultra-noob.com/blog/2021/5/)
  - [poly group](https://pixologic.jp/project/polygroup/) → apply

##### dinamics
###### [micro poly](https://www.youtube.com/watch?v=4E9N5UTbpz8&list=RDCMUCWiZI2dglzpaCYNnjcejS-Q&start_radio=1&rv=4E9N5UTbpz8&t=6)
- un weld all でバラバラになる
- thickness
  - [poly group](https://pixologic.jp/project/polygroup/) → apply

##### [SDiv — Subdivision](https://kizakiaoi.wordpress.com/2019/09/08/zbrush%E3%81%AE%E3%82%B5%E3%83%96%E3%83%87%E3%82%A3%E3%83%93%E3%82%B8%E3%83%A7%E3%83%B3%E3%83%AC%E3%83%99%E3%83%AB%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6/comment-page-1/)
###### [uv master](http://www.cg-modeler.info/2016/12/zbrush-uv-master.html)
- GoZ (maya, max)
- import (reUV): .obj, fbx,..
###### detail
- layer & morph / コントラスト (AO プレビュー): [ref](https://pin.it/rqIwb3h)
- [surface noise](http://docs.pixologic.com/user-guide/3d-modeling/sculpting/surface-noise/noisemaker/)
  - poly paint
    - [multi map exporter](https://www.youtube.com/watch?v=tEMi25cyr2c)
      - もしくわ hi poly を .spp で low poly にベイク
      - export: .tiff, .png → [.spp](https://www.youtube.com/watch?v=j6N3JbpH03c&list=PLkzopwqcFevb1YSAAxrAQ2jU-GlScjVur)

#### [zremesher](https://kizakiaoi.wordpress.com/2019/12/23/zbrush%E3%81%AEzremesherz%E3%83%AA%E3%83%A1%E3%83%83%E3%82%B7%E3%83%A3%E3%83%BC%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6/)
##### [zmodeler](https://www.youtube.com/watch?v=UJ1-UfKfzh0)
- extender
###### [dynamic](https://iroirozakkityou.com/post-6713/)
- [crease](https://mononoco.com/creative-design/zbrush/selectlasso-crease)
  - [poly group](https://note.com/info_/n/nce2a263fd59d) → apply

##### dinamics
###### micro poly
- un weld all でバラバラになる
- thickness
  - [poly group](https://pixologic.jp/project/polygroup/) → apply

##### [SDiv — Subdivision](https://pixologic.jp/6523/subd-dyna/)
###### [ProjectALL](https://www.youtube.com/watch?v=-rOLjfFtZ8E)
- [uv master](https://your-3d.com/zbrush-uvmaster/)
  - GoZ (maya, max)
  - import (reUV): .obj, fbx,..
- detail
  - layer & morph: [ref](https://pin.it/rqIwb3h)
  - [surface noise](http://docs.pixologic.com/user-guide/3d-modeling/sculpting/surface-noise/noisemaker/)
    - poly paint
      - [multi map exporter](https://www.youtube.com/watch?v=tEMi25cyr2c)
        - もしくわ hi poly を .spp で low poly にベイク
        - export: .tiff, .png → [.spp](https://www.youtube.com/watch?v=j6N3JbpH03c&list=PLkzopwqcFevb1YSAAxrAQ2jU-GlScjVur)

#### [retopology](https://www.youtube.com/watch?v=Bi4i7PuzPYI)
- [playlist](https://m.youtube.com/watch?v=cawgyCmLbDw&list=PLsAGMA2n5MYik-iDTSptl6boqKGidCDM8&index=25)
##### GoZ (maya, max)
##### import
###### .obj, fbx,..
- [poly group = mID, UV](https://area.autodesk.jp/column/tutorial/character_arpeggio/05_texture/) → export

## [play_list](https://www.youtube.com/playlist?list=PLsAGMA2n5MYj5ABqYHCK9lB1ePi4MMkFW)
## text3D
## [figure](https://twitter.com/sakaki_kaoru)
- /3Dprint
## sculpt
