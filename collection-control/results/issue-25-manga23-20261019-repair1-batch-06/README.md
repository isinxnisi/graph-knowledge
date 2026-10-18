# 収集Workerの処理結果

issue-25-manga23-20261019-repair1-batch-06：**blocked**

公開apply・restore・本番配置は行わない。承認者名は本人認証の証明ではない。

Existing public:validate failed (Node 24 + dependencies required): /home/isinxnisi/.local/share/plunode-collection-worker/runtime/lib/server/public-dataset.ts:92
  const fixture = fixtureV4Schema.parse(JSON.parse(data));
                                  ^

ZodError: [
  {
    "origin": "string",
    "code": "invalid_format",
    "format": "datetime",
    "pattern": "/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$/",
    "path": [
      "entities",
      581,
      "createdAt"
    ],
    "message": "Invalid ISO datetime"
  },
  {
    "origin": "string",
    "code": "invalid_format",
    "format": "datetime",
    "pattern": "/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$/",
    "path": [
      "entities",
      581,
      "updatedAt"
    ],
    "message": "Invalid ISO datetime"
  },
  {
    "origin": "string",
    "code": "invalid_format",
    "format": "datetime",
    "pattern": "/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$/",
    "path": [
      "entities",
      1368,
      "createdAt"
    ],
    "message": "Invalid ISO datetime"
  },
  {
    "origin": "string",
    "code": "invalid_format",
    "format": "datetime",
    "pattern": "/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$/",
    "path": [
      "entities",
      1368,
      "updatedAt"
    ],
    "message": "Invalid ISO datetime"
  }
]
    at loadPublicRelease (/home/isinxnisi/.local/share/plunode-collection-worker/runtime/lib/server/public-dataset.ts:92:35)
    at async <anonymous> (/home/isinxnisi/.local/share/plunode-collection-worker/runtime/scripts/public-kg.ts:21:45)

Node.js v24.21.0


