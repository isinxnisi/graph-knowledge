"""Reject identity mismatches across classic/containerd stores before activation."""
import copy, hashlib, importlib.util, io, json, pathlib, tarfile, tempfile, unittest
spec=importlib.util.spec_from_file_location('capsule_release',pathlib.Path(__file__).resolve().parents[1]/'scripts/release-capsule-production.py')
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)

class ImageIdentityTests(unittest.TestCase):
    def setUp(self):
        self.source='a'*40
        self.identity={'configId':'sha256:'+'b'*64,'manifestId':'sha256:'+'c'*64,'diffIds':['sha256:'+'d'*64]}
        self.image={'Id':self.identity['configId'],'Os':'linux','Architecture':'amd64','RootFS':{'Layers':self.identity['diffIds']},'Config':{'Labels':{'org.opencontainers.image.revision':self.source}}}
    def test_classic_and_containerd_have_distinct_expected_ids(self):
        self.assertEqual(release.verify_loaded_image(self.image,self.identity,[],self.source),self.identity['configId'])
        self.image['Id']=self.identity['manifestId']
        self.assertEqual(release.verify_loaded_image(self.image,self.identity,[['driver-type','io.containerd.snapshotter.v1']],self.source),self.identity['manifestId'])
    def test_wrong_store_id_is_not_generically_allowed(self):
        with self.assertRaises(AssertionError):release.verify_loaded_image(self.image,self.identity,[['driver-type','io.containerd.snapshotter.v1']],self.source)
    def test_wrong_bytes_platform_source_and_unknown_store_are_rejected(self):
        for field,value in [('Id','sha256:'+'f'*64),('Architecture','arm64'),('RootFS',{'Layers':[]}),('Config',{'Labels':{'org.opencontainers.image.revision':'wrong'}})]:
            with self.subTest(field=field):
                image=copy.deepcopy(self.image);image[field]=value
                with self.assertRaises(AssertionError):release.verify_loaded_image(image,self.identity,[],self.source)
        with self.assertRaises(AssertionError):release.verify_loaded_image(self.image,self.identity,[['driver-type','unknown']],self.source)
    def archive(self,path,corrupt=False):
        files={};rows=[];descriptors=[];manifest={'sourceCommit':self.source}
        def blob(value):
            data=value if isinstance(value,bytes) else json.dumps(value).encode();digest='sha256:'+hashlib.sha256(data).hexdigest();files['blobs/sha256/'+digest[7:]]=data;return digest
        layer=blob(b'synthetic layer bytes')
        for key in ('web','memberOps'):
            tag='fixture-'+key+':release'
            config=blob({'os':'linux','architecture':'amd64','config':{'Labels':{'org.opencontainers.image.revision':self.source,'kind':key}},'rootfs':{'diff_ids':[layer]}})
            image=blob({'config':{'digest':config},'layers':[{'digest':layer,'mediaType':'application/vnd.oci.image.layer.v1.tar'}]})
            manifest[key]={'tag':tag,'imageId':config}
            rows.append({'Config':'blobs/sha256/'+config[7:],'RepoTags':[tag],'Layers':['blobs/sha256/'+layer[7:]]})
            descriptors.append({'mediaType':'application/vnd.oci.image.manifest.v1+json','digest':image,'annotations':{'io.containerd.image.name':'docker.io/library/'+tag}})
        files['manifest.json']=json.dumps(rows).encode();files['index.json']=json.dumps({'manifests':descriptors}).encode()
        if corrupt:files['blobs/sha256/'+layer[7:]]=b'changed layer bytes'
        with tarfile.open(path,'w:gz') as tar:
            for name,data in files.items():
                info=tarfile.TarInfo(name);info.size=len(data);tar.addfile(info,io.BytesIO(data))
        return manifest
    def test_verified_archive_binds_each_tag_config_manifest_and_layers(self):
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/'image.tar.gz';manifest=self.archive(path)
            ids=release.archive_identities(path,manifest)
            self.assertEqual(ids['web']['configId'],manifest['web']['imageId'])
            self.assertNotEqual(ids['web']['manifestId'],ids['web']['configId'])
            manifest['web']['tag']='not-in-archive:release'
            with self.assertRaises(AssertionError):release.archive_identities(path,manifest)
    def test_corrupted_layer_fails_even_when_inspect_identity_would_match(self):
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/'image.tar.gz';manifest=self.archive(path,True)
            with self.assertRaisesRegex(AssertionError,'blob bytes'):release.archive_identities(path,manifest)

if __name__=='__main__':unittest.main()
