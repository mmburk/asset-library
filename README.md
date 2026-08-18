# @burak/asset-library

Three.js için prosedürel, **Zero-GC**, low-poly oyun asset kütüphanesi.

Diskten veya ağdan hiçbir şey yüklenmez: her mesh `BoxGeometry` / `CylinderGeometry` /
`SphereGeometry` / `ConeGeometry` primitiflerinden üretilir, her doku kod içinde
oluşturulur. Geometri ve materyaller referans sayımıyla paylaşılır, animasyon hiç
tahsis yapmadan çalışır, her asset ödünç aldığı kaynağı tam olarak geri verir.

```bash
npm install
npm run dev        # / insansı karakterler · /brainrot.html brainrot arketipleri
npm run build      # dist/ üretir (ESM + UMD + .d.ts)
npm run verify     # başsız doğrulama harness'i (214 kontrol)
```

Üç modül var:

| Modül | Ne için |
|---|---|
| `characters/` | Elle ayarlanmış **insansı** sistem: 8 arketip, sabit 20 eklemli rig, detaylı stil seçenekleri |
| `creatures/` | **Genel** sistem: bildirimsel iskelet, 5 gövde planı, 5 animatör, 11 tarif ile spawn |
| `equipment/` | **Tutma eylemi**: hayalet el, katana, nişan alma, geri tepme, kılıç sallama ve vuruş tespiti |

---

## Hızlı başlangıç

### Brainrot yaratıklar

```ts
import { AssetContext, spawnFromRecipe } from '@burak/asset-library';

const context = new AssetContext({ seed: 'arena' });

const shark = spawnFromRecipe(context, {
  recipeId: 'tralalero-shark',
  colorPalette: 'random',
  scale: 'boss',
});

scene.add(shark.root);

// Kare döngüsünde:
shark.setState(speed, grounded, turnRate);
shark.update(dt);

// Öldürme ve temizlik:
shark.die();
shark.dispose();
```

### İnsansı karakterler

```ts
import { createCharacter, LocomotionAnimator } from '@burak/asset-library';

const guard = createCharacter(context, {
  proportions: { height: 1.85 },
  palette: { shirt: 0x8f3b3b },
  style: { hair: 'ponytail', beard: true, shoulderPads: true },
}).build();

scene.add(guard.root);

const animator = new LocomotionAnimator(guard.rig);
animator.setState(speed, grounded, turnRate);
animator.update(dt);

guard.attach('handR', swordMesh);
```

---

## Brainrot arketipleri (Faz 2)

| Tarif | Plan | Animatör | Ölçek | Ölüm | Ne test ediyor |
|---|---|---|---|---|---|
| `gigachad` | biped | `BipedAnimator` | player | collapse | Kaslı insansı, hareketli çene kemiği, pec/bicep soketleri |
| `mewing-doggo` | quadruped | `QuadrupedAnimator` | minion | collapse | Diyagonal tırıs, çene menteşesi, 3 segmentli kuyruk |
| `skibidi-propeller` | flyer | `FlightAnimator` | player | deflate | Pervane, kanat çırpma↔süzülme geçişi, viraj yatması |
| `tralalero-shark` | swimmer | `SwimAnimator` | player | melt | 5 segmentli gövde dalgası, 3 bacak, jenerik spor ayakkabı |
| `tung-tung-sahur` | biped | `BipedAnimator` | player | collapse | Referanstan modellendi: burun, kapalı sırıtış, çubuk uzuvlar, yere değen sopa |
| `bombardino-crocodilo` | flyer | `FlightAnimator` | boss | collapse | Referanstan modellendi: çift motor (`propellerL`/`propellerR`), açık çene, asılı bomba (`payload`) |
| `la-vacca-saturno` | biped | `BipedAnimator` | boss | collapse | Referanstan modellendi: halka sistemi, küreye gömülü inek kafası, ayak bileği halkalı çıplak ayaklar |
| `frigo-camelo` | biped | `BipedAnimator` | player | collapse | Referanstan modellendi: gövde yerine buzdolabı, S kıvrımlı deve boynu, bağcıklı bot |
| `udin-din-din-dun` | biped | `BipedAnimator` | player | collapse | Referanstan modellendi: gövde ve kafa tek küre, küre yüzeyine oturtulmuş insan suratı, dev kollar, spor ayakkabı |
| `ninja-coffee` | biped | `BipedAnimator` | player | collapse | Referanstan modellendi: gövdenin tamamı bir karton bardak, alın koruyuculu bant, çift katana (gerçek eller + `addBlade`) |
| `ballerina-cappuccina` | biped | `BipedAnimator` | player | collapse | Referanstan modellendi: kafa yerine kapuçino fincanı (döndürülmüş profil + kulp), fincan duvarına oturtulmuş anime yüz, tütü etek, balerin patikleri |
| `brr-brr-patapim` | biped | `BipedAnimator` | player | collapse | Referanstan modellendi: yüzden sarkan dev burun, beş parmaklı devasa çıplak ayaklar, yosun pelerin + kök saçak, kök parmaklı gerçek eller |
| `cactus-walker` | hybrid | `HybridWalkAnimator` | boss | melt | 4 kök bacakla dalga yürüyüşü, tepe ağırlıklı salınım, muz modülleri |

Plana özgü ek girdiler:

```ts
if (creature.animator instanceof FlightAnimator) creature.animator.setClimbRate(vy);
if (creature.animator instanceof SwimAnimator)   creature.animator.setInWater(true);
```

### Uçan gövde planı: tek motor mu, çift motor mu

`FlightAnimator` burun pervanesini `propeller`, kanat motorlarını `propellerL` /
`propellerR` adıyla arar; iskelet hangisini bildiriyorsa onu döndürür, olmayanı
sessizce yutar. İki kanat motoru **tek bir açıyı** paylaşır — ikinci bir sayaç
yalnızca kayması gereken ikinci bir şey olurdu — ama sağdaki ters yöne döner.

`payload` kemiği asılı bir yükü (bomba, harici tank) temsil eder: gövdeye kaynak
değil, askıdadır, dolayısıyla viraj ve tırmanışta gövdenin dönüşünü
`payloadSwing` oranında **reddeder**. `0` yükü gövdeye kilitler, `1` tam düşey
tutar.

### Halka gibi ilkel olmayan biçimler

`BoneShape` dört ilkel biliyor; halka yok. `la-vacca-saturno`'nun halka sistemi bu
yüzden **döndürülmüş bir yarıçap boyunca dizilmiş kutulardan** kuruluyor —
`propellerBlades` ile aynı numara. Sonuç: bir bandın 14 dilimi **tek bir
geometriyi** paylaşır, üç bant üç buffer eder; maliyet üçgende değil **draw
call**'da (93 mesh'in 42'si halka). Uzaktaki kopyalar için `mergeGeometries`
zaten tek çizime indiriyor.

Dilim genişliği teğet kirişi (`2 * dışYarıçap * tan(π/n)`), yani komşu dilimler
dış kenarda köşe köşeye değer, içeride hafifçe binişir — aradaki farkı kapatmak
için elle pay vermek gerekmiyor.

### Poligon bütçesi

`player` ölçeğinde, `segments: 7` varsayılanıyla:

| Tarif | Üçgen | Mesh (= draw call) |
|---|---|---|
| `skibidi-propeller` | 460 | 34 |
| `mewing-doggo` | 740 | 49 |
| `tralalero-shark` | 760 | 58 |
| `gigachad` | 816 | 38 |
| `cactus-walker` | 1 018 | 61 |
| `frigo-camelo` | 1 052 | 62 |
| `tung-tung-sahur` | 1 630 | 54 |
| `la-vacca-saturno` | 1 640 | 93 |
| `bombardino-crocodilo` | 1 780 | 119 |
| `udin-din-din-dun` | 2 416 | 94 |

Üçgen sayısı hiçbir yerde sorun değil; maliyet **draw call** tarafında. Rig'li
bir yaratık parça başına bir çizim yapar, çünkü hiyerarşi animasyonun kendisidir.
Kalabalık için `mergeGeometries` tek bir mesh'e indirir (`bombardino` → 1 draw
call, 1 780 üçgen) — karşılığında iskelet donar, yani uzak/statik kopyalar için.
Geometri ve materyaller zaten paylaşımlı: 100 `bombardino` sahnede 71 geometri ve
7 materyal tutar.

### Ölçek

Geometri her zaman iskeletin yazıldığı boyutta üretilir, boyut **kökte `scale` ile**
uygulanır. Sonuç: aynı tariften bir minion, bir player ve bir boss **tek bir geometri
kümesini paylaşır** — doğrulama harness'i bunu ayrıca kontrol ediyor.

| Tier | Hedef boy |
|---|---|
| `minion` | 0.8 birim |
| `player` | 1.8 birim (referans) |
| `boss` | 3.75 birim |

`scale` verilmezse yaratık kendi doğal boyunda gelir. `scale` bir sayı verilirse
dünya birimi cinsinden hedef boy olarak yorumlanır. `scaleMultiplier` üstüne çarpan
uygular, `randomize: true` ise ±%12 boy varyasyonu ekler.

### Yeni arketip eklemek

Kod değil, veri işi. Bir `SkeletonDefinition` döndüren fonksiyon yazıp `recipes.ts`'e
kaydediyorsunuz:

```ts
export function createMyCreatureSkeleton(): SkeletonDefinition {
  return {
    name: 'my-creature',
    plan: 'quadruped',          // animatörü bu seçer
    nominalHeight: 0.9,
    bones: [
      bone('hips', null, [0, 0.45, -0.3], [
        box([0.3, 0.28, 0.34], 'primary'),
      ]),
      ...quadLeg('legFL', 'hips', [0.15, -0.04, 0.02]),
      // …
    ],
    sockets: [socket('back', 'hips', [0, 0.18, 0])],
  };
}
```

Animatörler kemiklere **isimle** erişir (`legFLUpper`, `jaw`, `propeller`, `body0`…)
ve olmayan kemikleri sessizce yutar, dolayısıyla kısmi iskeletler de çalışır.

---

## Yön konvansiyonu

Kütüphane genelinde geçerli:

| Eksen | Anlam |
|-------|-------|
| `+Z`  | Karakterin baktığı yön (`ASSET_FORWARD`) |
| `+Y`  | Yukarı |
| `+X`  | Karakterin **kendi** solu (`left = up × forward = Y × Z = X`) |

Uzuvlar eklem pivotundan `-Y` yönünde uzar. Bunun iki doğrudan sonucu var:

- Pozitif `rotation.x` bir uzvu **geriye** salar (`v = (0,−1,0)` → `z' = −sinθ`)
- Pozitif `rotation.x` gövdeyi **öne** eğer (`v = (0,1,0)` → `z' = +sinθ`)

Bütün animatörlerdeki işaretler bu türetmeye dayanır.

---

## Mimari

```
src/
├── core/
│   ├── math.ts           Tahsissiz skaler matematik (damp, smoothstep, wrap…)
│   ├── Rng.ts            mulberry32 — deterministik, string tohum destekli
│   ├── Scratch.ts        Ön-tahsisli Vector3/Quat/Matrix4 + RingPool
│   ├── ResourceCache.ts  Referans sayımlı GeometryCache + MaterialCache
│   ├── ObjectPool.ts     Generic serbest-liste havuzu
│   ├── GeometryUtils.ts  merge / taper / bend / jitter / güvenli dispose
│   ├── Palette.ts        Bit-math renk işlemleri + hazır paletler
│   ├── materials.ts      Flat Lambert / Toon + prosedürel gradient rampası
│   ├── AssetContext.ts   Paylaşılan üretim ortamı
│   ├── Asset.ts          Ödünç defterli temel sınıf
│   └── AssetRegistry.ts  Veri güdümlü spawn için id → tanım
├── characters/           İnsansı modül (8 arketip, LocomotionAnimator)
└── creatures/
    ├── types.ts          BoneDefinition, BoneShape, SkeletonDefinition, PosableRig
    ├── CreatureRig.ts    Bildirimsel iskeletten genel rig
    ├── CreatureBuilder.ts Şekil → mesh (4 primitif ailesi)
    ├── CreatureAsset.ts  Asset sarmalayıcı + ölçek hedefleme
    ├── recipes.ts        13 arketip + spawnFromRecipe
    ├── animators/        Taban + biped/quadruped/flyer/swimmer/hybrid + DeathOverlay
    └── skeletons/        13 iskelet + şekil yardımcıları
└── equipment/
    ├── types.ts          GhostHandOptions, GripStyle, BladeExtent, soket adları
    ├── GhostHandAsset.ts Hayalet ön kol + el (kademeli saydamlık ile sönümleme)
    ├── SwordAsset.ts     Prosedürel katana; kesici kenarını kendisi yayımlar
    ├── AimController.ts  Kaldır-nişan al pozu; iki tutuş yolunu da sürer
    ├── RecoilController.ts Geri tepme yayı (tam çözümlü, tepe = 1'e normalize)
    ├── SwingController.ts Kesme zamanlaması + pozu (4 kesiş, zincirlenebilir)
    ├── BladeSweep.ts     Swept kenar → küre vuruş tespiti, salınım başına bir kez
    └── EquipmentHolder.ts Silahı ele verir; el yoksa çift el çağırır
```

### Eli olmayanlar silahı nasıl tutar

Kütüphanedeki yaratıkların çoğunun eli yok — köpek dört ayaklı, timsah yarı uçak,
inek bir gezegen. Her birine kalıcı kol modellemek yaratığın ne *olduğunu*
değiştirirdi. Bu yüzden el yaratığın bir parçası değil, **tutma eyleminin** bir
parçası: silah verildiği anda iki hayalet ön kol beliriyor, silah alınınca
dağılıyor.

```ts
const doggo = spawnFromRecipe(context, { recipeId: 'mewing-doggo' });
doggo.equip(rifle, { grip: 'two-handed' });  // çift el belirir
doggo.unequip();                             // el dağılır, silah geri döner
```

Yol iskeletin kendisi karar veriyor, çağıran değil: `handL`/`handR` soketi olan
iskeletler (GigaChad, Tung Tung, kaktüs) silahı doğrudan alır, hayalet çıkmaz.
Olmayanlar `ghostHandL`/`ghostHandR` soketinde el üretir; o soket de yoksa yer
yaratığın kendi sınırlarından türetilir, yani yeni bir iskelet soket yazılmadan
önce de çalışır.

İki uygulama detayı önemli:

- **Sönümleme materyali mutasyona uğratmaz.** Materyaller paylaşımlı ve referans
  sayımlı; `opacity`'yi animasyona bağlamak aynı materyali kullanan her varlığı
  boyardı. Bunun yerine saydamlık altı kademeye bölündü, her kademe kendi
  önbellek anahtarı ve mesh kademeler arasında geçiş yapıyor — bütün oyundaki
  hayalet eller için toplam on iki materyal.
- **Ön kol aşağı-dışa açılı.** Dümdüz geriye giden bir ön kol, tutulan tüfeğin
  dipçiğiyle aynı hacmi paylaşıyor.

### Nişan alma

```ts
doggo.setAiming(true);        // harmanlanarak kalkar, tetikleme değil durum
doggo.setAim(yaw, pitch);     // yaratığın kendi bakış yönüne göre, radyan
doggo.aimAt(x, y, z);         // ya da doğrudan dünya noktası
```

Poz iki tutuş yolunda farklı uygulanıyor ama aynı açıya varıyor:

- **Hayalet eller serbest**, o yüzden yerinden oynatılıyor: yukarı, içeri ve öne
  destekli konuma, sonra nişan yönüne döndürülüyor.
- **Gerçek kollar** omuzdan ve dirsekten poza sokuluyor. Buradaki tuzak şu:
  ele bağlı bir silah bütün kol zincirini miras alır, yani omzu 75° kaldırınca
  namlu da 75° göğe döner. Bu yüzden silah kendi **mount**'unda duruyor ve
  mount kemik uzayında değil yaratık uzayında sürülüyor — kol serbestçe poz
  alırken silah nişan alınan yeri göstermeye devam ediyor.

İki kısıt kayda değer. Poz **animatörden sonra** yazılmalı: biped animatörü kol
rotasyonunu her karede mutlak yazıyor, önce uygulanan poz siliniyor. Ve kolun
`y`/`z` ekseni animatörce sıfırlanmadığı için harmanlama **rest'ten** yapılmalı;
önceki kareden harmanlanırsa 0.05 ağırlıkta bile kol birkaç saniyede tam poza
tırmanıyor ve bir daha çıkmıyor.

### Ateş etme

```ts
if (creature.fire()) { /* mermi çıkar, ses çal */ }  // atış kabul edildiyse
creature.recoil();                                   // 0 = durgun, 1 = tek atış tepesi
```

Geri tepme bir keyframe değil, **vurulan bir yay**. Atış yaya bir dürtü
veriyor. Bu üç şeyi bedavaya getiriyor: seri atış kendiliğinden birikiyor,
toparlanmanın ortasında gelen atış silahı makul bir yerde buluyor, ve oturma
hareketinde gerçek bir sarkma oluyor — eğrilmiş bir rampa değil.

`fire()` silahın kendi atış hızını uyguluyor (`cooldown`), yani tetiği basılı
tutan çağıran her karede çağırabilir; kabul edilmeyen atış `false` dönüyor.

**Yay tam çözümle ilerletiliyor**, Euler'le değil. Bu bir zarafet meselesi
değil: bu sertlikte sayısal entegrasyon varsayılan yayda tepeyi %9, yumuşak bir
yayda %29 ıskalıyordu — yani `kick: 0.22` gerçekte 0.20 ya da 0.16 radyan
demek oluyordu. Tek adımın kapalı çözümü sabit adım için kurucuda hesaplanınca
üç sönüm rejiminde de tepe 1.000'e oturuyor ve `kick`/`push`/`twist` gerçekten
radyan/oran cinsinden tepe değeri oluyor.

Geri tepme nişan pozunun **üstüne** biniyor ve pozlanan düğümün *kendi*
uzayında uygulanıyor. İkisi de kasıtlı: nişan kısmı ağırlıkla ölçekleniyor ve
dinlenmede yok oluyor, geri tepme ölçeklenmiyor — böylece kalçadan ateşte de
silah tepiyor. Ve namlu, gövdenin ileri yönünde değil kendi ekseninde
yükseliyor, yani 60° yana nişan almış bir silah doğru yönde tepiyor.

Kare süresi 100 ms'yi aşarsa fark telafi edilmeden düşürülüyor: durmuş bir
karenin ardından tepmeye devam eden silah, o kareyi atlayandan daha kötü.

### Kılıç sallama ve vuruş

```ts
const katana = new SwordAsset(context, {
  scale: weaponScaleForHeight(creature.rig.nominalHeight),
}).build();
creature.equip(katana.root);

creature.addHitTarget(enemy.root, 0.6, enemy);   // küre yarıçapı + kendi nesnen
creature.onHit((hit) => enemy.hurt(hit.damage)); // kayıt **yeniden kullanılıyor**

creature.swing();          // basılı tutulan tuş her karede çağırabilir
creature.isStriking();     // yalnızca kesme penceresi açıkken true
```

İki ayrı parça, tek bir boolean'la buluşuyorlar. `SwingController` kesmenin
**nasıl göründüğünü** ve her evresinin ne kadar sürdüğünü biliyor; `BladeSweep`
kenarın **neyin içinden geçtiğini**. Aralarındaki tek bağ `striking`. Ayrı
durmalarının sebebi: bir oyun kendi vuruş tespitini bu pozun üstünde sürebilsin,
ya da bu pozu kendi durum makinesinden tetikleyip diğer yarısını hiç almasın.

**Kesme swept, anlık değil.** Bir strike 90 ms sürüyor ve o sürede kılıcın ucu
bir gövdenin çoğunu kat ediyor — 60 fps'te kendi boyunun dörtte biri kadar yol
alıyor, 20 fps'te ondan ince olan her şeyin içinden ışınlanıyor. Kare aralığında
yol örneklendiği için (`sweepSteps`) kare hızı düştükçe vuruş kaybolmuyor, ki bir
hitbox'ın davranabileceği en kötü şekil budur. Doğrulama harness'ı bunu iki
yönlü test ediyor: örnekleme açıkken 2.4 birimlik sıçrama hedefi vuruyor,
`sweepSteps: 1` ile aynı sıçrama ıskalıyor.

**Bir salınım her hedefi bir kez vuruyor.** Sayaçla değil, salınım kimliğiyle
takip ediliyor: dört kare boyunca hedefin üstünde duran bir kesme yine tek vuruş
bildiriyor, sıradaki kesme yeniden vurabiliyor.

Kesici kenarın nerede olduğunu **silah kendisi bildiriyor**
(`userData.blade`, bkz. `BladeExtent`). Bildirmeyen bir nesne de çalışıyor —
sweep onu ölçüyor — ama o zaman hitbox'a sap ve onu tutan yumruk da dahil
oluyor. `SwordAsset` bunu kendiliğinden yayımlıyor.

Poz, nişan pozunun **üstüne** ve animatörden **sonra** biniyor; kesme boyunca
nişan bırakılıyor. Kolun `y`/`z` ekseni yine **rest'ten** harmanlanıyor
([Nişan alma](#nişan-alma)'daki ratchet'in aynısı) ve salınım bittiği kare
yakalanan rest değerleri bir kez daha yazılıyor: harman kendi başına binde bire
kadar yaklaşıyor, ama o kalıntı her salınımda bir kez daha birikirdi.

Elsiz bir yaratıkta salınımı taşıyan şey `handTravel`: hayalet el *kolun
kendisi*, dolayısıyla kılıcı gövdenin önünden geçiren tek şey elin yolu. Sıfıra
indirilirse kesme, havada duran bir elin bilek hareketine dönüşüyor.

`addBlade()` elde tutulmayan ikinci bir kesiciyi kaydediyor — `ninja-coffee`'nin
sol elindeki katana, bir mahmuz, bir boynuz. Gövdeyle birlikte savruluyor ve
kesiyor, ama tutuşun kendisi değil.

### Neden skinning yok

Faceted low-poly karakterlerde rijit parça hiyerarşisi, skinning ile görsel olarak
aynı sonucu verir; ancak kemik matrisi yüklemesi ve skinning shader'ı olmadığı için
CPU maliyeti sıfırdır. Animasyon düz Euler açısı yazmaya indirgenir — animasyon
yolunun tahsissiz olabilmesinin sebebi budur.

### `PosableRig`: iki rig ailesi, tek ölüm animasyonu

`DeathOverlay`, sınıf kalıtımı yerine **yapısal** bir arayüze (`root`, `joints`,
`restPositions`, `restRotations`) karşı çalışır. `HumanoidRig` bu arayüzü zaten
karşılıyor — hiçbir şeyi değiştirmeden. Böylece tek bir ölüm implementasyonu her iki
rig ailesini de sürüyor.

### Kaynak sahipliği

`ResourceCache` referans sayar. Yüz muhafız tek bir kafa geometrisini ve tek bir ten
materyalini paylaşır; birini `dispose()` etmek diğer doksan dokuzu bozmaz. `Asset`
taban sınıfı her ödünç almayı deftere yazar (tekrarlar dahil — iki ödünç iki iade
gerektirir) ve `dispose()` tam olarak alınanı iade eder.

### Boy garantisi

İnsansı modülde dört dikey oran üretim anında normalize edilir; toplamları `height`'i
tam olarak verir. Yaratık modülünde ise inşa sonrası gerçek bounding box ölçülür ve
hedef boya göre ölçeklenir — yani iskelet verisi kaysa bile istenen tier'a tam oturur.

### Adım kadansı

Yürüme frekansı hızdan türetilir (`speed / strideLength`). Bu yüzden ayaklar kaymaz
ve aynı hızda yürüyen bir goblin ile bir ogre otomatik olarak farklı boyda adım atar.
Bütün animatörler **mutlak** açı yazar, delta biriktirmez — kare süresi ne kadar
düzensiz olursa olsun poz kayamaz.

---

## Doğrulama

`npm run verify` başsız çalışır (WebGL gerekmez) ve derlenmiş bundle'ı test eder.
214 kontrolün tamamı geçiyor:

| Alan | Kontrol |
|---|---|
| İnsansı boy | 8 arketipte < %0.5 hata, ayaklar `y=0` |
| Paylaşım | 50 özdeş karakter → 14 geometri, 7 materyal |
| Yaşam döngüsü | Kısmi dispose paylaşılanları öldürmüyor; son iade sıfırlıyor |
| Kararlılık | 1 simüle saat sonrası tüm eklemler sonlu ve sınırlı |
| Determinizm | Aynı girdi dizisi → bit-özdeş poz; aynı tohum → aynı asset |
| `mergeGeometries` | Vertex/index sayıları, index aralığı ve genişliği |
| Yaratık ölçeği | 3 tier'ın üçü de hedef boya tam oturuyor, hepsi zeminde |
| Ölçek paylaşımı | Bir tarifin 3 farklı boyu **aynı** geometrileri paylaşıyor |
| Animatör eşleşmesi | Her plan doğru animatör sınıfını alıyor |
| Ölüm | 3 stilin (collapse/melt/deflate) hepsi tamamlanıyor, rig sonlu kalıyor |
| Prop tuzağı | Elinde sopa taşıyan biped **ayaklarının** üstünde duruyor, sopasının değil |
| Kesme penceresi | Wind-up'tan sonra açılıyor, 6 karede kapanıyor; kesme kolu gerçekten hareket ettiriyor |
| Poz iadesi | 100 zincirli salınımdan sonra kol `z`'si **tam olarak** rest değerine dönüyor |
| Vuruş | Menzildeki hedef bir kez vuruluyor, menzil dışı hiç; sıradaki salınım yeniden vurabiliyor |
| Swept test | 2.4 birimlik sıçrama vuruyor; `sweepSteps: 1` ile aynı sıçrama ıskalıyor |
| Tahsis | İnsansı **ve** yaratık `update()` → 600.000 çağrıda 0 bayt |

**Tahsis ölçümü hakkında bir not.** Bu ortamda üç yöntem denendi ve üçü de kendi
kontrol testinde başarısız oldu: `heapUsed` farkları JIT gürültüsüne boğuluyor,
`PerformanceObserver` burada hiç `gc` olayı yaymıyor, ve `--trace-gc` koleksiyon
sayımı tahsisi hiç izlemiyor. Kullanılan yöntem — kare döngüsünü kapsayan, süreç
içinde başlatılan V8 örnekleme heap profilleyicisi — her koşuda bir **kontrol** ile
birlikte çalışır: çağrı başına bir nesne tahsis eden kontrol kaydedilmezse test
başarısız olur, sessizce geçmez. Kontrolün eleniyor olmaması için tahsis canlı bir
diziye yazılır; yerel bir değişkene atamak V8'in kaçış analizi tarafından tamamen
siliniyordu.

---

## Yol haritası

- **Faz 1** ✅ Çekirdek altyapı + insansı karakter sistemi
- **Faz 2** ✅ Genel yaratık sistemi + 5 brainrot arketipi (idle/hareket/ölüm)
- **Faz 3** Saldırı aksiyonları, hasar tepkileri, ek arketipler
  — ekipman tutuşu (hayalet el) ✅, nişan alma pozu ✅, ateş etme/geri tepme ✅,
  kılıç sallama + swept vuruş tespiti ✅ (`SwordAsset`, `SwingController`,
  `BladeSweep`), ek arketipler: `bombardino-crocodilo` ✅, `la-vacca-saturno` ✅,
  `frigo-camelo` ✅, `udin-din-din-dun` ✅, `ninja-coffee` ✅,
  `ballerina-cappuccina` ✅, `brr-brr-patapim` ✅
- **Faz 4** Doğa & çevre (ağaç, kaya, arazi, su)
- **Faz 5** Modüler yapı kiti (duvar/zemin/çatı/kapı, grid-snap)
- **Faz 6** Props & GPU partikül FX
- **Kalabalık optimizasyonu** `InstancedMesh` yolu ve statik yaratıklar için merge

---

## Notlar

- `three` bir **peer dependency**'dir (`>=0.160.0`). Kütüphane bundle'ında yer almaz.
- Sonuç, orijinal memelerin AI dokusunu değil, **stilize low-poly yorumunu** verir —
  saf primitif üretiminin doğal sonucu.
- Marka içermez: Tralalero'nun ayakkabıları jenerik spor ayakkabı olarak modellendi,
  hiçbir logo veya tescilli işaret kullanılmadı.
- `noUncheckedIndexedAccess` bilinçli olarak kapalı: `Float32Array` indekslemesinde
  her erişimi `number | undefined` yapıp geometri döngülerini `!` gürültüsüne
  boğuyordu.
- `Scratch` slotları kısa ömürlüdür — referansını saklamayın, değeri kopyalayın.
