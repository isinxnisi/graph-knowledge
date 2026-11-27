"""Exercise the publication queue without Google accounts, remote writes or film generation."""
import base64
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

from ledger import Ledger
from youtube_account import WindowsSecrets
from youtube_publication import YouTubePublication, metadata
from youtube_wire import MANAGE, READ, UPLOAD, RemoteError, YouTubeAPI, checked_session


class TestVault:
    def seal(self, value):
        return b"sealed:" + base64.b64encode(value.encode())

    def open(self, value):
        return base64.b64decode(value.removeprefix(b"sealed:")).decode()


class Google:
    def __init__(self):
        self.channel_id = "UC" + "a" * 22
        self.language = "ja"
        self.scopes = " ".join((UPLOAD, READ, MANAGE))
        self.created = 0
        self.data = b""
        self.complete = False
        self.lose_answer = False
        self.expired = False
        self.privacy = "unlisted"
        self.processing = "processed"
        self.thumb = 0
        self.caption = 0

    def token(self, form):
        if form["grant_type"] == "authorization_code":
            assert "code_verifier" in form
        return {"access_token":"access", "refresh_token":"forever", "scope":self.scopes}

    def channel(self, token):
        return dict(id=self.channel_id,title="Channel",handle="@test",intermediate=None)

    def initiate(self, token, meta, size):
        self.created += 1
        self.privacy = meta["privacy"]
        return "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=opaque"

    def transfer(self, token, session, size, *, offset=None, chunk=b""):
        if self.expired:
            raise RemoteError(410)
        ident = "abcDEF-1234"
        if self.complete:
            return None, self.video(token,ident)
        if offset is None:
            return len(self.data), None
        assert offset == len(self.data)
        self.data += chunk
        if len(self.data) == size:
            self.complete = True
            if self.lose_answer:
                raise RemoteError(0)
            return None,self.video(token,ident)
        return len(self.data),None

    def video(self, token, ident):
        if ident == "missing1234":
            return None
        return {"id":ident, "snippet":{"channelId":self.channel_id, "defaultAudioLanguage":self.language},
                "status":{"privacyStatus":self.privacy, "uploadStatus":self.processing, "embeddable":True}}

    def change_privacy(self, token, resource, privacy):
        self.privacy = privacy

    def thumbnail(self, token, video, mime, data):
        self.thumb += 1

    def captions(self, token, video, lang, data):
        self.caption += 1

    def revoke(self, refresh):
        pass


class PublicationTest(unittest.TestCase):
    def setUp(self):
        work = tempfile.TemporaryDirectory()
        self.addCleanup(work.cleanup)
        self.ledger = Ledger(Path(work.name))
        self.case_id, self.run = "b"*32, "c"*32
        with self.ledger.db() as db:
            db.execute("INSERT INTO cases(id,title,brief,snapshot,updated) VALUES(?,?,?,?,?)",
                       (self.case_id,"題材","制作",json.dumps(dict(themeId="theme:1",revision=3,title="題材")), "today"))
            db.execute("""INSERT INTO runs(id,case_id,model,langs,reason,status,progress,created,plan,editions)
                       VALUES(?,?,?,?,?,'done','','now',?,?)""",
                       (self.run,self.case_id,"test",'["ja","en"]',"",json.dumps({"titles":{"ja":"観察","en":"Look"}}),
                        '{"ja":{"timings":[]},"en":{"timings":[]}}'))
        for lang in ("ja","en"):
            path = self.ledger.folder/"cases"/self.case_id/self.run/lang
            path.mkdir(parents=True)
            (path/"video.mp4").write_bytes(("film"+lang).encode())
            (path/"subtitles.srt").write_text("1\n00:00:00,000 --> 00:00:01,000\nOne\n",encoding="utf-8")
        self.google = Google()
        self.start()
        self.yt.configure({"clientId":"movie.apps.googleusercontent.com","clientSecret":"private-config"})
        self.login("ja")

    def start(self):
        self.yt = YouTubePublication(self.ledger,"https://movie.example.org",api=self.google,vault=TestVault())

    def login(self,lang):
        query = parse_qs(urlsplit(self.yt.connect(lang,{"manage":True},actor="owner")["url"]).query)
        return self.yt.callback(query["state"][0],"mock",actor="owner")

    def submit(self):
        draft = self.yt.draft(self.case_id,self.run,"ja")
        return self.yt.submit(self.case_id,self.run,"ja",{"channelId":self.google.channel_id,"metadata":draft})

    def now(self):
        with self.ledger.db() as db:
            db.execute("UPDATE youtube_jobs SET due=0 WHERE due IS NOT NULL")
        self.assertTrue(self.yt.work_once())

    def row(self):
        return self.yt.case(self.case_id)["items"][0]

    def test_pkce_actor_one_time_and_distinct_channel(self):
        auth = parse_qs(urlsplit(self.yt.connect("en",actor="owner")["url"]).query)
        self.assertEqual(auth["code_challenge_method"],["S256"])
        self.assertEqual(auth["redirect_uri"],["https://movie.example.org/api/youtube/oauth/callback"])
        state = auth["state"][0]
        with self.assertRaisesRegex(ValueError,"異なる"):
            self.yt.callback(state,"mock",actor="other")
        with self.assertRaisesRegex(ValueError,"同じチャンネル"):
            self.yt.callback(state,"mock",actor="owner")
        with self.assertRaisesRegex(ValueError,"期限切れ"):
            self.yt.callback(state,"mock",actor="owner")
        self.google.channel_id = "UC"+"b"*22
        self.assertEqual(self.login("en")["channel"]["id"],self.google.channel_id)
        self.assertNotIn("forever",str(self.yt.settings()))

    def test_dedup_and_recover_lost_final_then_update_in_place(self):
        with ThreadPoolExecutor(max_workers=3) as pool:
            jobs = list(pool.map(lambda _:self.submit(),range(3)))
        self.assertEqual(len({r["id"] for r in jobs}),1)
        self.now()
        self.google.lose_answer = True
        self.now()
        self.start()
        self.now()
        self.assertEqual(self.row()["status"],"processing")
        self.now()
        self.assertEqual((self.google.created,self.row()["canEmbed"]), (1,True))
        ident = self.row()["id"]
        self.yt.action(ident,"privacy",{"privacy":"private"})
        self.now()
        self.assertEqual((self.row()["privacy"],self.row()["canEmbed"]),("private",False))
        self.yt.action(ident,"captions",{})
        self.now()
        self.yt.action(ident,"thumbnail",{"contentType":"image/png","imageBase64":base64.b64encode(b"\x89PNG\r\n\x1a\nmock").decode()})
        self.now()
        self.assertEqual((self.google.caption,self.google.thumb,self.google.created),(1,1,1))

    def test_expired_session_after_final_waits_for_identity(self):
        job = self.submit()
        self.now()
        self.google.lose_answer = True
        self.now()
        self.google.expired = True
        self.start()
        self.now()
        self.assertEqual(self.row()["status"],"uncertain")
        with self.assertRaises(ValueError):
            self.yt.action(job["id"],"retry",{})
        self.assertEqual(self.submit()["id"],job["id"])
        self.yt.action(job["id"],"reconcile",{"videoId":"abcDEF-1234"})
        self.now()
        self.assertEqual((self.row()["status"],self.google.created),("ready",1))

    def test_register_rejects_wrong_language_and_keeps_missing_separate(self):
        data = {"videoId":"abcDEF-1234", "channelId":self.google.channel_id}
        self.google.language = "en"
        with self.assertRaisesRegex(ValueError,"不一致"):
            self.yt.register(self.case_id,self.run,"ja",data)
        self.google.language = "ja"
        r = self.yt.register(self.case_id,self.run,"ja",data)
        self.assertEqual((r["source"],r["privacy"]),("existing","unlisted"))
        self.assertEqual(self.yt.register(self.case_id,self.run,"ja",data)["id"], r["id"])
        self.yt.action(r["id"],"sync",{})
        self.google.video = lambda token, ident: None
        self.now()
        self.assertEqual((self.row()["status"],self.row()["canEmbed"]),("missing",False))

    def test_draft_and_letter_limits_and_trash(self):
        draft = self.yt.draft(self.case_id,self.run,"en")
        self.assertIn("/en/t/theme%3A1?",draft["description"])
        self.assertIs(metadata(draft,"en")["madeForKids"], False)
        draft["description"] = "映"*1667
        self.assertEqual(self.yt.save_draft(self.case_id,self.run,"en",draft),
                         {key: value for key, value in draft.items() if key != "suggestedTags"})
        self.assertEqual(self.yt.draft(self.case_id,self.run,"en"),draft)
        with self.assertRaisesRegex(ValueError,"5,000"):
            metadata(draft,"en")
        with self.ledger.db() as db:
            db.execute("UPDATE cases SET trashed_at='today'")
        with self.assertRaisesRegex(ValueError,"ゴミ箱"):
            self.submit()

    def test_new_and_legacy_drafts_get_metadata_without_manual_selection(self):
        japanese = self.yt.draft(self.case_id, self.run, "ja")
        english = self.yt.draft(self.case_id, self.run, "en")
        self.assertEqual(japanese["tags"], ["Plunode", "題材", "観察"])
        self.assertEqual(english["tags"], ["Plunode", "Look"])
        self.assertEqual(japanese["categoryId"], "27")
        self.assertEqual(english["categoryId"], "27")

        old_draft = {key: value for key, value in japanese.items() if key not in ("tags", "categoryId")}
        old_draft["madeForKids"] = None
        with self.ledger.db() as db:
            db.execute("INSERT INTO youtube_drafts VALUES(?,?,?,?)", (self.case_id, self.run, "ja", json.dumps(old_draft)))
        self.assertEqual(self.yt.draft(self.case_id, self.run, "ja"), japanese)
        posted = self.yt.submit(self.case_id, self.run, "ja", {"channelId": self.google.channel_id, "metadata": old_draft})
        self.assertIs(posted["metadata"]["madeForKids"], False)
        self.assertEqual(posted["metadata"]["categoryId"], "27")
        self.assertEqual(posted["metadata"]["tags"], ["Plunode", "題材", "観察"])

        override = dict(english, tags=[], categoryId="28", madeForKids=True)
        fields = {key: value for key, value in override.items() if key != "suggestedTags"}
        self.assertEqual(self.yt.save_draft(self.case_id, self.run, "en", override), fields)
        self.assertEqual(self.yt.draft(self.case_id, self.run, "en"), override)
        self.assertEqual(metadata(override, "en"), fields)

    def test_tags_prepared_by_author_are_language_specific_and_can_be_suggested_again(self):
        with self.ledger.db() as db:
            db.execute("UPDATE runs SET editions=?", (json.dumps({
                "ja": {"youtubeTags": ["天体 観測", "映像編集", "Plunode"]},
                "en": {"youtubeTags": ["telescope mirror", "frame, cut", None]},
            }),))
        japanese = self.yt.draft(self.case_id, self.run, "ja")
        english = self.yt.draft(self.case_id, self.run, "en")
        self.assertEqual(japanese["tags"], ["Plunode", "天体 観測", "映像編集", "題材", "観察"])
        self.assertEqual(english["tags"], ["Plunode", "telescope mirror", "frame cut", "Look"])
        self.yt.save_draft(self.case_id, self.run, "en", dict(english, tags=["custom"]))
        saved = self.yt.draft(self.case_id, self.run, "en")
        self.assertEqual(saved["tags"], ["custom"])
        self.assertEqual(saved["suggestedTags"], english["tags"])

    def test_expiration_embeds_and_google_credentials(self):
        self.submit()
        for _ in range(3):
            self.now()
        with self.ledger.db() as db:
            db.execute("UPDATE youtube_jobs SET checked_at=1")
        self.assertFalse(self.row()["canEmbed"])
        self.yt.disconnect("ja")
        self.assertIsNone(self.row()["privacy"])
        with self.assertRaises(ValueError):
            checked_session("https://unrelated.example.org/upload/youtube/v3/videos?upload_id=opaque")

    def test_selected_captioned_variant_resumes_same_file_across_restart(self):
        original_media = self.ledger.media
        source = original_media(self.case_id,self.run,"ja","video.mp4").with_name("captioned.mp4")
        source.write_bytes(b"captioned movie")
        def medium(case_id, run, lang, name):
            if name == "captioned.mp4":
                return source
            return original_media(case_id,run,lang,name)
        with patch.object(self.ledger,"media",medium), patch("youtube_publication.CHUNK",4):
            data = {"metadata":self.yt.draft(self.case_id,self.run,"ja"),"channelId":self.google.channel_id,
                    "mediaVariant":"captioned"}
            data["metadata"]["madeForKids"] = False
            job = self.yt.submit(self.case_id,self.run,"ja",data)
            self.assertEqual(job["mediaVariant"],"captioned")
            self.now()
            self.now()
            self.assertEqual(self.google.data,b"capt")
            self.start()
            while self.row()["status"] != "ready":
                self.now()
            self.assertEqual(self.google.data,b"captioned movie")
            self.assertEqual(self.google.created,1)

    def test_expired_partial_can_restart_but_changed_file_cannot_continue(self):
        job = self.submit()
        self.now()
        self.google.expired = True
        self.now()
        self.assertEqual(self.row()["status"],"queued")
        self.google.expired = False
        self.now()
        (self.ledger.folder/"cases"/self.case_id/self.run/"ja"/"video.mp4").write_bytes(b"replacement")
        self.now()
        self.assertEqual(self.row()["status"],"attention")
        self.assertEqual(self.google.data,b"")
        self.assertEqual(self.yt.action(job["id"],"cancel",{})["status"],"failed")

    def test_upload_wire_uses_explicit_privacy_and_308_remote_offset(self):
        wire = YouTubeAPI()
        url = "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test"
        wire.request = Mock(return_value=(200,{"Location":url},{}))
        values = self.yt.draft(self.case_id,self.run,"ja")
        self.assertEqual(wire.initiate("access",values,100),url)
        request = wire.request.call_args
        self.assertIn("notifySubscribers=false",request.args[1])
        self.assertEqual(request.kwargs["body"]["status"]["privacyStatus"],"unlisted")
        self.assertIs(request.kwargs["body"]["status"]["selfDeclaredMadeForKids"], False)
        self.assertEqual(request.kwargs["body"]["snippet"]["categoryId"], "27")
        self.assertEqual(request.kwargs["body"]["snippet"]["tags"], ["Plunode", "題材", "観察"])
        wire.request.return_value = (308,{"Range":"bytes=0-40"},{})
        self.assertEqual(wire.transfer("access",url,100),(41,None))
        self.assertEqual(wire.request.call_args.kwargs["headers"]["Content-Range"],"bytes */100")
        wire.request.return_value = (308,{"Range":"bytes=0-100"},{})
        with self.assertRaises(ValueError):
            wire.transfer("access",url,100,offset=41,chunk=b"x")

    @unittest.skipUnless(os.name=="nt","Windows DPAPI")
    def test_windows_secret_storage(self):
        vault = WindowsSecrets()
        protected = vault.seal("test-only")
        self.assertNotIn(b"test-only",protected)
        self.assertEqual(vault.open(protected),"test-only")


if __name__ == "__main__":
    unittest.main()
