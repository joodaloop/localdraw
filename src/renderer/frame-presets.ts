export interface FramePreset {
	name: string
	w: number
	h: number
}

export interface FramePresetGroup {
	category: string
	presets: FramePreset[]
}

/** Figma's frame presets, in the order Figma lists them. */
export const FRAME_PRESET_GROUPS: FramePresetGroup[] = [
	{
		category: 'Phone',
		presets: [
			{ name: 'iPhone 17', w: 402, h: 874 },
			{ name: 'iPhone 16 & 17 Pro', w: 402, h: 874 },
			{ name: 'iPhone 16', w: 393, h: 852 },
			{ name: 'iPhone 16 & 17 Pro Max', w: 440, h: 956 },
			{ name: 'iPhone 16 Plus', w: 430, h: 932 },
			{ name: 'iPhone Air', w: 420, h: 912 },
			{ name: 'iPhone 14 & 15 Pro Max', w: 430, h: 932 },
			{ name: 'iPhone 14 & 15 Pro', w: 393, h: 852 },
			{ name: 'iPhone 13 & 14', w: 390, h: 844 },
			{ name: 'iPhone 14 Plus', w: 428, h: 926 },
			{ name: 'Android Compact', w: 412, h: 917 },
			{ name: 'Android Medium', w: 700, h: 840 },
		],
	},
	{
		category: 'Tablet',
		presets: [
			{ name: 'iPad mini 8.3', w: 744, h: 1133 },
			{ name: 'Surface Pro 8', w: 1440, h: 960 },
			{ name: 'iPad Pro 11"', w: 834, h: 1194 },
			{ name: 'iPad Pro 12.9"', w: 1024, h: 1366 },
			{ name: 'Android Expanded', w: 1280, h: 800 },
		],
	},
	{
		category: 'Desktop',
		presets: [
			{ name: 'MacBook Air', w: 1280, h: 832 },
			{ name: 'MacBook Pro 14"', w: 1512, h: 982 },
			{ name: 'MacBook Pro 16"', w: 1728, h: 1117 },
			{ name: 'Desktop', w: 1440, h: 1024 },
			{ name: 'Wireframes', w: 1440, h: 1024 },
			{ name: 'TV', w: 1280, h: 720 },
		],
	},
	{
		category: 'Presentation',
		presets: [
			{ name: 'Slide 16:9', w: 1920, h: 1080 },
			{ name: 'Slide 4:3', w: 1024, h: 768 },
		],
	},
	{
		category: 'Paper',
		presets: [
			{ name: 'A4', w: 595, h: 842 },
			{ name: 'A5', w: 420, h: 595 },
			{ name: 'A6', w: 297, h: 420 },
			{ name: 'Letter', w: 612, h: 792 },
			{ name: 'Tabloid', w: 792, h: 1224 },
		],
	},
]
