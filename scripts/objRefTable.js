const C3 = self.C3;
self.C3_GetObjectRefTable = function () {
	return [
		C3.Plugins.Sprite,
		C3.Plugins.Audio,
		C3.Plugins.Touch,
		C3.Plugins.Mouse
	];
};
self.C3_JsPropNameTable = [
	{a_giris: 0},
	{n_giris: 0},
	{btn_basla: 0},
	{btn_bilgi: 0},
	{btn_kaynakca: 0},
	{a_oyun: 0},
	{nesne_oyun: 0},
	{secenek: 0},
	{ses: 0},
	{Audio: 0},
	{Touch: 0},
	{Mouse: 0},
	{a_bitis: 0},
	{ev: 0},
	{a_bilgi: 0},
	{kemik: 0},
	{sorusayisi: 0}
];

self.InstanceType = {
	a_giris: class extends self.ISpriteInstance {},
	n_giris: class extends self.ISpriteInstance {},
	btn_basla: class extends self.ISpriteInstance {},
	btn_bilgi: class extends self.ISpriteInstance {},
	btn_kaynakca: class extends self.ISpriteInstance {},
	a_oyun: class extends self.ISpriteInstance {},
	nesne_oyun: class extends self.ISpriteInstance {},
	secenek: class extends self.ISpriteInstance {},
	ses: class extends self.ISpriteInstance {},
	Audio: class extends self.IInstance {},
	Touch: class extends self.IInstance {},
	Mouse: class extends self.IInstance {},
	a_bitis: class extends self.ISpriteInstance {},
	ev: class extends self.ISpriteInstance {},
	a_bilgi: class extends self.ISpriteInstance {},
	kemik: class extends self.ISpriteInstance {},
	sorusayisi: class extends self.ISpriteInstance {}
}