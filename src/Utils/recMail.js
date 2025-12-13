const axios = require('axios');
const { setTimeout } = require('timers/promises');

async function getKey() {
    try {
        const response = await axios.post("https://smailpro.com/app/key", {
            domain: "gmail.com",
            username: "random",
            server: "server-1",
            type: "alias"
        }, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "it-IT,it;q=0.8,en-US;q=0.5,en;q=0.3",
                "Content-Type": "application/json",
                "x-g-token": "",
                "X-XSRF-TOKEN": "",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin"
            },
            withCredentials: true,
            timeout: 10000
        });

        return response.data.items;
    } catch (error) {
        console.error('Errore:', error.message);
        throw error;
    }
}

async function getEmail() {
    try {
        const key = await getKey();
        const response = await axios.get(`https://api.sonjj.com/email/gm/get`, {
            params: {
                key: key,
                domain: "gmail.com",
                username: "random",
                server: "server-1",
                type: "alias"
            },
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "it-IT,it;q=0.8,en-US;q=0.5,en;q=0.3",
                "x-rapidapi-ua": "RapidAPI-Playground",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "cross-site"
            },
            timeout: 10000
        });

        return response.data.items;

    } catch (error) {
        console.error('Errore:', error.message);
        throw error;
    }
}

async function getMid(email) {
    await delay(10000);
    try {
        const key = await getKey();
        const response = await axios.get(`https://api.sonjj.com/email/gm/check`, {
            params: {
                key: key,
                'rapidapi-key': 'f871a22852mshc3ccc49e34af1e8p126682jsn734696f1f081',
                email: email.email,
                timestamp: email.timestamp
            },
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "it-IT,it;q=0.8,en-US;q=0.5,en;q=0.3",
                "x-rapidapi-ua": "RapidAPI-Playground",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "cross-site"
            },
            timeout: 10000
        });

        return response.data.items[0].mid;
    } catch (error) {
        console.error('Errore in getMid:', error.message);
        // Retry mechanism
        await delay(5000);
        return await getMid(email);
    }
}

async function getMessage(email) {
    try {
        const mid = await getMid(email);
        const key = await getKey();
        const response = await axios.get(`https://api.sonjj.com/email/gm/read`, {
            params: {
                key: key,
                'rapidapi-key': 'f871a22852mshc3ccc49e34af1e8p126682jsn734696f1f081',
                email: email.email,
                message_id: mid
            },
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "it-IT,it;q=0.8,en-US;q=0.5,en;q=0.3",
                "x-rapidapi-ua": "RapidAPI-Playground",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "cross-site"
            },
            timeout: 10000
        });

        const securityCodeMatch = response.data.items.body.match(/>\s*(\d{6})\s*<\/span>/);
        return securityCodeMatch[1];
    } catch (error) {
        console.error('Errore in getMessage:', error.message);
        throw error;
    }
}

function delay(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

module.exports = {
    getEmail,
    getMessage
};