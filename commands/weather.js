const axios = require("axios");
const moment = require("moment-timezone");
const Canvas = require("../func/canvasHelper");
const fs = require("fs-extra");
const path = require("path");

try {
	Canvas.registerFont(
		path.join(__dirname, "assets/font/BeVietnamPro-SemiBold.ttf"), {
		family: "BeVietnamPro-SemiBold"
	});
	Canvas.registerFont(
		path.join(__dirname, "assets/font/BeVietnamPro-Regular.ttf"), {
		family: "BeVietnamPro-Regular"
	});
} catch (_) {}

function convertFtoC(F) {
	return Math.floor((F - 32) / 1.8);
}
function formatHours(hours, timezone = "UTC") {
	return moment(hours).tz(timezone).format("HH[h]mm[p]");
}

module.exports = {
	config: {
		name: "weather",
		version: "1.2",
		author: "NTKhang",
		cooldown: 5,
		role: 0,
		description: "view the current and next 5 days weather forecast",
		category: "other",
		usage: "{pn} <location>"
	},

	async onStart({ args, message, config }) {
		const apikey = "d7e795ae6a0d44aaa8abb1a0a7ac19e4";
        const timezone = config.TIMEZONE || "UTC";

		const area = args.join(" ");
		if (!area)
			return message.reply("Please enter a location");
		let areaKey, dataWeather, areaName;

		try {
			const response = (await axios.get(`https://api.accuweather.com/locations/v1/cities/search.json?q=${encodeURIComponent(area)}&apikey=${apikey}&language=en-us`)).data;
			if (response.length == 0)
				return message.reply(`Location not found: ${area}`);
			const data = response[0];
			areaKey = data.Key;
			areaName = data.LocalizedName;
		}
		catch (err) {
			return message.reply(`Error: ${err.response?.data?.Message || err.message}`);
		}

		try {
			dataWeather = (await axios.get(`http://api.accuweather.com/forecasts/v1/daily/10day/${areaKey}?apikey=${apikey}&details=true&language=en`)).data;
		}
		catch (err) {
			return message.reply(`❌ Error: ${err.response?.data?.Message || err.message}`);
		}

		const dataWeatherDaily = dataWeather.DailyForecasts;
		const dataWeatherToday = dataWeatherDaily[0];
		const msg = `Today's weather in ${areaName}: ${dataWeather.Headline.Text}\n🌡 Low - high temperature ${convertFtoC(dataWeatherToday.Temperature.Minimum.Value)}°C - ${convertFtoC(dataWeatherToday.Temperature.Maximum.Value)}°C\n🌡 Feels like ${convertFtoC(dataWeatherToday.RealFeelTemperature.Minimum.Value)}°C - ${convertFtoC(dataWeatherToday.RealFeelTemperature.Maximum.Value)}°C\n🌅 Sunrise ${formatHours(dataWeatherToday.Sun.Rise, timezone)}\n🌄 Sunset ${formatHours(dataWeatherToday.Sun.Set, timezone)}\n🌞 Day: ${dataWeatherToday.Day.LongPhrase}\n🌙 Night: ${dataWeatherToday.Night.LongPhrase}`;

		const bgPath = path.join(__dirname, "assets/image/bgWeather.jpg");
        if (!fs.existsSync(bgPath)) return message.reply(msg);

		const bg = await Canvas.loadImage(bgPath);
		const { width, height } = bg;
		const canvas = Canvas.createCanvas(width, height);
		const ctx = canvas.getContext("2d");
		ctx.drawImage(bg, 0, 0, width, height);
		let X = 100;
		ctx.fillStyle = "#ffffff";
		const data = dataWeather.DailyForecasts.slice(0, 7);
		for (const item of data) {
			// SVG might not be supported directly by node-canvas without extra libs, skipping icon for simplicity in port
			ctx.font = "30px BeVietnamPro-SemiBold";
			const maxC = `${convertFtoC(item.Temperature.Maximum.Value)}°C `;
			ctx.fillText(maxC, X, 366);

			ctx.font = "30px BeVietnamPro-Regular";
			const minC = String(`${convertFtoC(item.Temperature.Minimum.Value)}°C`);
			const day = moment(item.Date).format("DD");
			ctx.fillText(minC, X, 445);
			ctx.fillText(day, X + 20, 140);

			X += 135;
		}

		const tempDir = path.join(process.cwd(), "temp");
		await fs.ensureDir(tempDir);
		const pathSaveImg = path.join(tempDir, `weather_${areaKey}_${Date.now()}.jpg`);
		await fs.writeFile(pathSaveImg, canvas.toBuffer("image/jpeg", { quality: 0.9 }));

		const sent = await message.reply({
			body: msg,
			attachment: pathSaveImg,
			textFirst: true
		});
		setTimeout(() => fs.unlink(pathSaveImg).catch(() => {}), 20000);
		return sent;

	}
};
