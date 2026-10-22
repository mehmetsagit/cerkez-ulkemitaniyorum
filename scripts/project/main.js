
const WORD_SOUNDS = [
	"0-ulke.webm",
	"1-sehir.webm",
	"2-cumhur.webm",
	"3-baskent.webm",
	"4-nehir.webm",
	"5-soyisim.webm",
	"6-adigey.webm",
	"7-millet.webm",
	"8-dag.webm"
];

const QUESTIONS = [
	{ targetFrame: 0, choices: [5, 7, 0, 8] },
	{ targetFrame: 1, choices: [1, 6, 4, 5] },
	{ targetFrame: 2, choices: [5, 2, 0, 1] },
	{ targetFrame: 3, choices: [7, 1, 0, 3] },
	{ targetFrame: 4, choices: [4, 6, 1, 2] },
	{ targetFrame: 5, choices: [2, 4, 5, 3] },
	{ targetFrame: 6, choices: [5, 6, 3, 4] },
	{ targetFrame: 7, choices: [3, 5, 0, 7] },
	{ targetFrame: 8, choices: [8, 4, 5, 6] }
];
const TOTAL_QUESTIONS = QUESTIONS.length;

const CORRECT_SOUND = "dogru.webm";
const WRONG_SOUND = "hatali.webm";
const OPTION_BOXES = [
	{ left: 211, top: 364, right: 703, bottom: 456 },
	{ left: 211, top: 477, right: 703, bottom: 569 },
	{ left: 211, top: 589, right: 703, bottom: 681 },
	{ left: 211, top: 702, right: 703, bottom: 794 }
];
const OPTION_BOX_RADIUS = 17;
const OPTION_TEXT_LEFT_PADDING = 14;
const OPTION_TEXT_MAX_WIDTH = 460;
const OPTION_TEXT_MAX_HEIGHT = 78;
const WRONG_ANSWER_LOCK_SECONDS = 1;
const CORRECT_ANSWER_LOCK_SECONDS = 1.2;
const BONE_REVEAL_SECONDS = 1.4;
const BUTTON_HOVER_SCALE = 1.04;

const mediaUrlCache = new Map();
const audioChannels = new Map();
const activeEffects = new Map();
const boneEffects = new Map();
let latestAudioRequestId = 0;
let hoveredButtonEffect = null;

const game = {
	questionIndex: -1,
	correctFrame: -1,
	answeredCount: 0,
	acceptingAnswers: false,
	nextQuestionAt: 0,
	finishAt: 0,
	options: [],
	soundButtons: [],
	bones: [],
	questionNumber: null,
	boneBaseStates: new Map(),
	hoveredOption: null,
	optionClickLockedUntil: 0
};

runOnStartup(async runtime =>
{
	runtime.addEventListener("beforeprojectstart", () => OnBeforeProjectStart(runtime));
});

function OnBeforeProjectStart(runtime)
{
	runtime.addEventListener("afteranylayoutstart", event => OnLayoutStart(runtime, event.layout));
	runtime.addEventListener("pointerup", event => OnPointerUp(runtime, event));
	runtime.addEventListener("pointermove", event => OnPointerMove(runtime, event));
	runtime.addEventListener("pointercancel", () => ClearButtonHover(runtime));
	runtime.addEventListener("tick", () => Tick(runtime));
}

function OnLayoutStart(runtime, layout)
{
	StopAllAudio();
	ClearEffects();
	ClearBoneEffects();
	hoveredButtonEffect = null;
	SetPointerCursor(runtime, false);

	if (layout.name.toLowerCase() === "oyun")
	{
		layout.getLayer(0).addEventListener("afterdraw", event => DrawHighlights(runtime, event.renderer));
		StartGame(runtime);
	}
}

function StartGame(runtime)
{
	game.questionIndex = -1;
	game.correctFrame = -1;
	game.answeredCount = 0;
	game.acceptingAnswers = false;
	game.nextQuestionAt = 0;
	game.finishAt = 0;
	game.hoveredOption = null;
	game.optionClickLockedUntil = 0;
	game.options = GetInstances(runtime, "secenek").sort((a, b) => a.y - b.y);
	game.soundButtons = GetInstances(runtime, "ses").sort((a, b) => a.y - b.y);
	game.bones = GetInstances(runtime, "kemik").sort((a, b) => a.y - b.y);
	game.questionNumber = SetupQuestionCounter(runtime);
	game.boneBaseStates = new Map();
	game.bones.forEach(bone =>
	{
		game.boneBaseStates.set(bone.uid, {
			width: bone.width,
			height: bone.height,
			color: [...bone.colorRgb],
			blendMode: bone.blendMode
		});
		bone.isVisible = false;
		bone.opacity = 0;
	});

	ShowNextQuestion(runtime);
}

function ShowNextQuestion(runtime)
{
	ClearEffects();
	game.questionIndex++;

	if (game.questionIndex >= TOTAL_QUESTIONS)
	{
		game.acceptingAnswers = false;
		game.finishAt = runtime.wallTime + 3;
		return;
	}

	const question = QUESTIONS[game.questionIndex];
	const targetFrame = question.targetFrame;
	game.correctFrame = targetFrame;

	const target = GetFirstInstance(runtime, "nesne_oyun");
	if (target)
	{
		target.stopAnimation();
		target.animationFrame = targetFrame;
	}

	const choices = question.choices;

	game.options.forEach((option, index) =>
	{
		option.stopAnimation();
		option.animationFrame = choices[index];
		AlignOptionInBox(option, index);
		ResetOptionAppearance(option);
	});

	game.acceptingAnswers = true;
	game.nextQuestionAt = 0;
	game.hoveredOption = null;
	game.optionClickLockedUntil = 0;
}

function OnPointerMove(runtime, event)
{
	const layer = runtime.layout.getLayer(0);
	const [x, y] = layer.cssPxToLayer(event.clientX, event.clientY);
	const layoutName = runtime.layout.name.toLowerCase();
	let isInteractive = false;

	if (layoutName === "giris")
	{
		game.hoveredOption = null;
		const hoveredButton = FindButtonAt(runtime,
			["btn_basla", "btn_bilgi", "btn_kaynakca"], x, y);
		SetButtonHover(hoveredButton);
		isInteractive = Boolean(hoveredButton);
	}
	else if (layoutName === "oyun")
	{
		const hoveredOption = game.options.find(option => IsPointInsideOption(option, x, y)) || null;
		const hoveredButton = game.soundButtons.find(button => button.containsPoint(x, y)) || null;
		const canSelectOption = game.acceptingAnswers
			&& runtime.wallTime >= game.optionClickLockedUntil;
		game.hoveredOption = canSelectOption ? hoveredOption : null;
		SetButtonHover(hoveredButton);
		isInteractive = (canSelectOption && Boolean(hoveredOption))
			|| Boolean(hoveredButton);
	}
	else if (layoutName === "bitis" || layoutName === "bilgi" || layoutName === "kaynakca")
	{
		game.hoveredOption = null;
		const hoveredButton = FindButtonAt(runtime, ["ev"], x, y);
		SetButtonHover(hoveredButton);
		isInteractive = Boolean(hoveredButton);
	}
	else
	{
		game.hoveredOption = null;
		SetButtonHover(null);
	}

	SetPointerCursor(runtime, isInteractive);
}

function OnPointerUp(runtime, event)
{
	if (event.pointerType === "mouse" && event.button !== 0)
		return;

	const layer = runtime.layout.getLayer(0);
	const [x, y] = layer.cssPxToLayer(event.clientX, event.clientY);
	const layoutName = runtime.layout.name.toLowerCase();

	if (layoutName === "giris")
	{
		if (ContainsPoint(runtime, "btn_basla", x, y))
		{
			SetButtonHover(null);
			runtime.goToLayout("oyun");
		}
		else if (ContainsPoint(runtime, "btn_bilgi", x, y))
		{
			SetButtonHover(null);
			runtime.goToLayout("bilgi");
		}
		else if (ContainsPoint(runtime, "btn_kaynakca", x, y))
		{
			SetButtonHover(null);
			runtime.goToLayout("kaynakca");
		}

		return;
	}

	if (layoutName === "bitis" || layoutName === "bilgi" || layoutName === "kaynakca")
	{
		if (ContainsPoint(runtime, "ev", x, y))
		{
			SetButtonHover(null);
			runtime.goToLayout("giris");
		}

		return;
	}

	if (layoutName !== "oyun")
		return;

	const soundIndex = game.soundButtons.findIndex(button => button.containsPoint(x, y));
	if (soundIndex !== -1 && game.options[soundIndex])
	{
		const frame = game.options[soundIndex].animationFrame;
		void PlaySound(runtime, WORD_SOUNDS[frame], "word");
		return;
	}

	if (!game.acceptingAnswers || runtime.wallTime < game.optionClickLockedUntil)
		return;

	const selected = game.options.find(option => IsPointInsideOption(option, x, y));
	if (!selected)
		return;

	if (selected.animationFrame === game.correctFrame)
	{
		game.acceptingAnswers = false;
		game.optionClickLockedUntil = runtime.wallTime + CORRECT_ANSWER_LOCK_SECONDS;
		game.answeredCount++;
		SetQuestionNumber(Math.min(game.answeredCount + 1, TOTAL_QUESTIONS));
		AwardBone(game.answeredCount - 1, runtime.wallTime);
		StartEffect(selected, "correct", runtime.wallTime, CORRECT_ANSWER_LOCK_SECONDS);
		void PlaySound(runtime, CORRECT_SOUND, "feedback");

		if (game.answeredCount >= TOTAL_QUESTIONS)
			game.finishAt = runtime.wallTime + 3;
		else
			game.nextQuestionAt = runtime.wallTime + CORRECT_ANSWER_LOCK_SECONDS;
	}
	else
	{
		game.optionClickLockedUntil = runtime.wallTime + WRONG_ANSWER_LOCK_SECONDS;
		game.hoveredOption = null;
		StartEffect(selected, "wrong", runtime.wallTime, WRONG_ANSWER_LOCK_SECONDS);
		void PlaySound(runtime, WRONG_SOUND, "feedback");
	}
}

function Tick(runtime)
{
	UpdateEffects(runtime.wallTime);
	UpdateBoneEffects(runtime.wallTime);

	if (runtime.layout.name.toLowerCase() !== "oyun")
		return;

	if (game.finishAt > 0 && runtime.wallTime >= game.finishAt)
	{
		game.finishAt = 0;
		SetButtonHover(null);
		runtime.goToLayout("bitis");
		return;
	}

	if (game.nextQuestionAt > 0 && runtime.wallTime >= game.nextQuestionAt)
		ShowNextQuestion(runtime);
}

function StartEffect(instance, type, now, duration)
{
	const existing = activeEffects.get(instance.uid);
	if (existing)
		RestoreEffect(existing);

	const effect = {
		instance,
		type,
		start: now,
		end: now + duration,
		width: instance.width,
		height: instance.height,
		color: [...instance.colorRgb],
		opacity: instance.opacity,
		blendMode: instance.blendMode
	};

	activeEffects.set(instance.uid, effect);
	instance.blendMode = "normal";
	instance.opacity = 1;
	instance.colorRgb = [1, 1, 1];
}

function UpdateEffects(now)
{
	for (const [uid, effect] of activeEffects)
	{
		if (now >= effect.end)
		{
			RestoreEffect(effect);
			activeEffects.delete(uid);
			continue;
		}

		const progress = (now - effect.start) / (effect.end - effect.start);
		const pulse = Math.sin(progress * Math.PI * 4);
		const scale = 1 + 0.035 * Math.abs(pulse);

		effect.instance.width = effect.width * scale;
		effect.instance.height = effect.height * scale;
		effect.instance.opacity = 1;
		effect.instance.blendMode = "normal";
		effect.instance.colorRgb = [1, 1, 1];
	}
}

function DrawHighlights(runtime, renderer)
{
	for (const effect of boneEffects.values())
	{
		const progress = Math.max(0, Math.min(1,
			(runtime.wallTime - effect.start) / (effect.end - effect.start)
		));
		const intensity = (1 - progress) * 0.65
			+ 0.55
			+ 0.25 * Math.abs(Math.sin(progress * Math.PI * 6));
		DrawBoneGlow(renderer, effect.instance, intensity);
	}

	for (const effect of activeEffects.values())
	{
		const progress = Math.max(0, Math.min(1,
			(runtime.wallTime - effect.start) / (effect.end - effect.start)
		));
		const intensity = 0.75 + 0.25 * Math.abs(Math.sin(progress * Math.PI * 5));
		DrawOptionGlow(renderer, effect.instance, effect.type, intensity);
	}

	if (game.hoveredOption && !activeEffects.has(game.hoveredOption.uid))
		DrawOptionGlow(renderer, game.hoveredOption, "hover", 0.75);
}

function DrawOptionGlow(renderer, option, type, intensity)
{
	const rgb = type === "correct"
		? [0.05, 1, 0.12]
		: type === "wrong"
			? [1, 0.04, 0.04]
			: [0.1, 0.55, 1];
	const box = GetOptionBox(option);
	const { left, top, right, bottom } = box;

	renderer.setBlendMode("normal");
	renderer.setCurrentZ(0);
	renderer.setColorFillMode();

	for (let ring = 3; ring >= 1; ring--)
	{
		const padding = 8 + ring * 9;
		const alpha = (0.035 + (4 - ring) * 0.025) * intensity;
		DrawRoundedRect(
			renderer,
			left - padding,
			top - padding,
			right + padding,
			bottom + padding,
			OPTION_BOX_RADIUS + padding,
			rgb,
			alpha
		);
	}

	const fillAlpha = (type === "hover" ? 0.18 : 0.42) * intensity;
	DrawRoundedRect(renderer, left, top, right, bottom, OPTION_BOX_RADIUS, rgb, fillAlpha);
	renderer.resetColor();
}

function DrawBoneGlow(renderer, bone, intensity)
{
	const halfWidth = Math.abs(bone.width) / 2;
	const halfHeight = Math.abs(bone.height) / 2;
	const rgb = [1, 0.76, 0.08];

	renderer.setBlendMode("normal");
	renderer.setCurrentZ(0);
	renderer.setColorFillMode();

	for (let ring = 4; ring >= 1; ring--)
	{
		const padding = 5 + ring * 7;
		const alpha = (0.025 + (5 - ring) * 0.025) * intensity;
		DrawRoundedRect(
			renderer,
			bone.x - halfWidth - padding,
			bone.y - halfHeight - padding,
			bone.x + halfWidth + padding,
			bone.y + halfHeight + padding,
			halfHeight + padding,
			rgb,
			alpha
		);
	}

	renderer.resetColor();
}

function DrawRoundedRect(renderer, left, top, right, bottom, radius, rgb, alpha)
{
	const safeRadius = Math.min(radius, (right - left) / 2, (bottom - top) / 2);
	const centerY = (top + bottom) / 2;
	const halfHeight = (bottom - top) / 2;
	const stripHeight = 2;

	renderer.setColor([rgb[0] * alpha, rgb[1] * alpha, rgb[2] * alpha, alpha]);

	for (let y = top; y < bottom; y += stripHeight)
	{
		const stripBottom = Math.min(y + stripHeight, bottom);
		const stripCenterY = (y + stripBottom) / 2;
		const distanceFromCenter = Math.abs(stripCenterY - centerY);
		let inset = 0;

		if (distanceFromCenter > halfHeight - safeRadius)
		{
			const circleY = distanceFromCenter - (halfHeight - safeRadius);
			inset = safeRadius - Math.sqrt(Math.max(0, safeRadius * safeRadius - circleY * circleY));
		}

		renderer.rect2(left + inset, y, right - inset, stripBottom);
	}
}

function ClearEffects()
{
	for (const effect of activeEffects.values())
		RestoreEffect(effect);

	activeEffects.clear();
}

function AwardBone(index, now)
{
	const bone = game.bones[index];
	if (!bone)
		return;

	const base = game.boneBaseStates.get(bone.uid);
	if (!base)
		return;

	bone.isVisible = true;
	bone.opacity = 0;
	bone.width = base.width * 0.45;
	bone.height = base.height * 0.45;
	bone.colorRgb = [1, 1, 1];
	bone.blendMode = "normal";

	boneEffects.set(bone.uid, {
		instance: bone,
		start: now,
		end: now + BONE_REVEAL_SECONDS,
		base
	});
}

function UpdateBoneEffects(now)
{
	for (const [uid, effect] of boneEffects)
	{
		if (now >= effect.end)
		{
			RestoreBoneEffect(effect);
			boneEffects.delete(uid);
			continue;
		}

		const progress = Math.max(0, Math.min(1,
			(now - effect.start) / (effect.end - effect.start)
		));
		const entranceProgress = Math.min(progress / 0.45, 1);
		const easeOut = 1 - Math.pow(1 - entranceProgress, 3);
		const pulse = Math.abs(Math.sin(progress * Math.PI * 5)) * 0.08 * (1 - progress);
		const scale = 0.45 + 0.55 * easeOut + pulse;

		effect.instance.isVisible = true;
		effect.instance.opacity = Math.min(1, entranceProgress * 1.8);
		effect.instance.width = effect.base.width * scale;
		effect.instance.height = effect.base.height * scale;
		effect.instance.colorRgb = [1, 1, 1];
		effect.instance.blendMode = "normal";
	}
}

function ClearBoneEffects()
{
	for (const effect of boneEffects.values())
		RestoreBoneEffect(effect);

	boneEffects.clear();
}

function RestoreBoneEffect(effect)
{
	const { instance, base } = effect;
	instance.isVisible = true;
	instance.opacity = 1;
	instance.width = base.width;
	instance.height = base.height;
	instance.colorRgb = [...base.color];
	instance.blendMode = base.blendMode;
}

function RestoreEffect(effect)
{
	const { instance } = effect;
	instance.width = effect.width;
	instance.height = effect.height;
	instance.colorRgb = effect.color;
	instance.opacity = effect.opacity;
	instance.blendMode = effect.blendMode;
}

function ResetOptionAppearance(option)
{
	option.colorRgb = [1, 1, 1];
	option.opacity = 1;
	option.blendMode = "normal";
}

function SetupQuestionCounter(runtime)
{
	const counterParts = GetInstances(runtime, "sorusayisi").sort((a, b) => a.x - b.x);
	counterParts.forEach(part => part.stopAnimation());

	const totalQuestions = counterParts[0] || null;
	const currentQuestion = counterParts.length >= 2
		? counterParts[counterParts.length - 1]
		: null;

	if (totalQuestions)
		totalQuestions.animationFrame = 1;

	if (currentQuestion)
		currentQuestion.animationFrame = TOTAL_QUESTIONS;

	return currentQuestion;
}

function SetQuestionNumber(questionNumber)
{
	if (!game.questionNumber)
		return;

	const safeQuestionNumber = Math.max(1,
		Math.min(questionNumber, TOTAL_QUESTIONS));

	game.questionNumber.stopAnimation();
	game.questionNumber.animationFrame = TOTAL_QUESTIONS - safeQuestionNumber + 1;
}

function AlignOptionInBox(option, index)
{
	const box = OPTION_BOXES[index];
	if (!box)
		return;

	const sourceWidth = option.imageWidth || Math.abs(option.width);
	const sourceHeight = option.imageHeight || Math.abs(option.height);
	const scale = Math.min(
		OPTION_TEXT_MAX_WIDTH / sourceWidth,
		OPTION_TEXT_MAX_HEIGHT / sourceHeight
	);

	option.width = sourceWidth * scale;
	option.height = sourceHeight * scale;
	option.x = box.left + OPTION_TEXT_LEFT_PADDING + option.width / 2;
	option.y = (box.top + box.bottom) / 2;
}

async function PlaySound(runtime, fileName, channel)
{
	const requestId = ++latestAudioRequestId;

	try
	{
		let url = mediaUrlCache.get(fileName);
		if (!url)
		{
			url = await runtime.assets.getMediaFileUrl(fileName);
			mediaUrlCache.set(fileName, url);
		}

		if (requestId !== latestAudioRequestId)
			return;

		StopPlayingAudio();

		const audio = new globalThis.Audio(url);
		audio.preload = "auto";
		audioChannels.set(channel, audio);
		await audio.play();
	}
	catch (error)
	{
		console.warn(`Ses çalınamadı: ${fileName}`, error);
	}
}

function StopAllAudio()
{
	latestAudioRequestId++;
	StopPlayingAudio();
}

function StopPlayingAudio()
{
	for (const audio of audioChannels.values())
	{
		audio.pause();
		audio.currentTime = 0;
	}

	audioChannels.clear();
}

function GetInstances(runtime, objectName)
{
	const objectClass = runtime.objects[objectName];
	return objectClass ? objectClass.getAllInstances() : [];
}

function GetFirstInstance(runtime, objectName)
{
	const objectClass = runtime.objects[objectName];
	return objectClass ? objectClass.getFirstInstance() : null;
}

function ContainsPoint(runtime, objectName, x, y)
{
	const instance = GetFirstInstance(runtime, objectName);
	return instance ? instance.containsPoint(x, y) : false;
}

function FindButtonAt(runtime, objectNames, x, y)
{
	for (const objectName of objectNames)
	{
		const instance = GetFirstInstance(runtime, objectName);
		if (instance && instance.containsPoint(x, y))
			return instance;
	}

	return null;
}

function SetButtonHover(button)
{
	if (hoveredButtonEffect && hoveredButtonEffect.instance === button)
		return;

	if (hoveredButtonEffect)
	{
		hoveredButtonEffect.instance.width = hoveredButtonEffect.width;
		hoveredButtonEffect.instance.height = hoveredButtonEffect.height;
		hoveredButtonEffect = null;
	}

	if (!button)
		return;

	hoveredButtonEffect = {
		instance: button,
		width: button.width,
		height: button.height
	};
	button.width = hoveredButtonEffect.width * BUTTON_HOVER_SCALE;
	button.height = hoveredButtonEffect.height * BUTTON_HOVER_SCALE;
}

function ClearButtonHover(runtime)
{
	SetButtonHover(null);
	game.hoveredOption = null;
	SetPointerCursor(runtime, false);
}

function SetPointerCursor(runtime, isInteractive)
{
	if (runtime.mouse)
		runtime.mouse.setCursorStyle(isInteractive ? "pointer" : "default");
}

function IsPointInsideOption(option, x, y)
{
	const { left, top, right, bottom } = GetOptionBox(option);
	return x >= left && x <= right && y >= top && y <= bottom;
}

function GetOptionBox(option)
{
	const index = game.options.indexOf(option);
	return OPTION_BOXES[index] || {
		left: option.x - Math.abs(option.width) / 2,
		top: option.y - Math.abs(option.height) / 2,
		right: option.x + Math.abs(option.width) / 2,
		bottom: option.y + Math.abs(option.height) / 2
	};
}
