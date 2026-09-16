# 収録曲の登録

public/donbeat/songs/catalog.json の songs 配列に曲を追加します。
パスはcatalog.jsonを基準に指定します。空の配列なら収録曲は表示されません。

例:
{
  "songs": [
    {"title": "Reply", "file": "reply/chart.mc"},
    {"title": "別の曲", "file": "other/chart.tja", "audio": "music.ogg"},
    {"title": "パック曲", "file": "pack.mcz"}
  ]
}

MC/TJA: 音源はWAVEまたはMC内soundから、動画はVIDEOまたはmeta.videoから解決します。
audio/videoを一覧に指定すると上書きできます。これらは譜面ファイルの場所が基準です。
MCZ/ZIP: 内部のMC/TJAと、内部で指定された音源・動画を読み込みます。
曲を開いた時にダウンロードします。読み込み失敗時は同じ曲を閉じて開くと再試行できます。
手動で読み込んだ曲と収録曲は同じ選曲一覧に表示します。
ギミックアイコンは譜面読み込み後に表示します。
このフォルダのファイルはサイト訪問者が取得できます。公開可能な素材を配置してください。

# MCのレベル

{"meta":{"mode":5,"version":"おに","level":9}}
meta.levelに正の数値を指定します。versionの次に記述できます（JSONのキー順序は任意）。
levelを優先し、未指定・無効の場合は従来のversion内の★/☆表記に戻ります。
どちらも不明なら星6以上の判定幅を使います。

# ギミックアイコン
↔ ソフラン: BPMが初期値から変化、MC scroll / TJA ABSCROLLが1以外、
またはMC hs / TJA SCROLLが負数。正方向のHS変化だけでは付きません。
◐ フェードアウト: MC fade:0 / TJA #FADE,0,... がある場合。
▶ MV付き: 動画指定または読み込み済み動画がある場合（動画未取得でも指定があれば表示）。
