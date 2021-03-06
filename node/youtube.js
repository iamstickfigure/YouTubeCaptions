var request = require("request");
var async = require("async");
var sprintf = require("sprintf-js").sprintf;
var sscanf = require("scanf").sscanf;
var xml2js = require("xml2js");
var cheerio = require("cheerio");
var node_vtt = new require("node-vtt")();

var api_key = "AIzaSyA7B2nB1Vf9qDp8WTudwBvvbd1Oz2123-A";

var channels_url = "https://www.googleapis.com/youtube/v3/channels";
var playlistItems_url = "https://www.googleapis.com/youtube/v3/playlistItems";
var captions_url = "https://www.googleapis.com/youtube/v3/captions";
var search_url = "https://www.googleapis.com/youtube/v3/search";
var timedtext_url = "https://www.youtube.com/api/timedtext";
var youtube_url = "https://www.youtube.com/watch";

var webvtt_baseURL = "https://manifest.googlevideo.com/api/manifest/webvtt"
var allowASR = false;

function get_asr_captions(videoId, callback) {
    var options = {
        method: 'GET',
        url: youtube_url,
        qs: {
            v: videoId
        }
    };
    async.waterfall([
        async.apply(request, options), //request(options, callback);
        function(respyt, bodyt, cbw) {
            // var results = bodyt.match(/"\s*caption_tracks\s*"\s*:\s*"[^"]*(https[^"]+)"/);
            // var results = bodyt.match(/"\s*caption_tracks\s*"\s*:\s*"[^"]*(https[^"]*kind(%[A-F0-9][A-F0-9])+asr[^"]*)"/);
            // var results = bodyt.match(/"\s*caption_tracks\s*"\s*:\s*"[^"]*(https[^"]*kind(%[A-F0-9][A-F0-9])+asr.*?)\\u\d+.*"/);
            // var results = bodyt.match(/"\s*caption_tracks\s*"\s*:\s*"[^"]*(https[^"]*kind(%[A-F0-9][A-F0-9])+asr.*?)(\\u\d+.*?)?"/);
            var results = bodyt.match(/"\s*caption_tracks\s*"\s*:\s*".*?(https.*?kind(%[A-F0-9][A-F0-9])+?asr.*?)"/);
            // if(results) console.log("Results " + results[1]);
            if(results) 
                cbw(null, decodeURIComponent(results[1]).replace(/\\u\d+.*/g, "")); //.replace(/\&amp\;/g, "&")
            else
                cbw("Couldn't Find any ASR tracks");
        }
    ], function(err, asr_url) {
        if(err) {
            // console.log("\n\n\n\n\n\n\n\n+++++++++++++++\nCaptions unavailable\n+++++++++++++++\n\n\n\n\n\n\n\n");
            callback(err);
        }
        else {
            request({
                method: 'GET',
                url: asr_url
            }, callback);
        }
    });
}

function get_livestream_feed(videoId, callback) {
    var options = {
        method: 'GET',
        url: youtube_url,
        qs: {
            v: videoId
        }
    }
    async.waterfall([
        async.apply(request, options),
        function(resps, bods, cbw) {
            var results = bods.match(/"\s*dashmpd\s*"\s*:\s*"\s*(https[^"]*)"/);
            if(results)
                cbw(null, results[1].replace(/\\\//g, "/")); // TODO: Properly unescape characters
            else
                cbw("Couldn't Find dashmpd to connect to caption stream");
        },
    ], callback);
}

function get_live_captions(live_feed_url, callback) {
    async.waterfall([
        function(cbw) {
            // console.log(live_feed_url + "\n");
            request({
                method: 'GET',
                url: live_feed_url
            }, cbw);
        },
        function(respd, bodd, cbw) {
            // console.log(bodd);
            var $ = cheerio.load(bodd);
            var adaptation_set = $('AdaptationSet[mimeType="text/vtt"]');
            var originalURL = $('BaseURL', adaptation_set).text();
            var segments = $('SegmentURL', adaptation_set);

            // console.log(segments.attr("media"));
            var sqs = [];
            segments.each(function() {
                sqs.push($(this).attr("media"));
            });
            cbw(null, {
                baseURL: originalURL,
                sq: sqs
            });

            // var path_params_str = originalURL.replace(webvtt_baseURL, "");
            // var querystring = path_params_str.replace(/\/([^\/]+)\/([^\/]+)/g, "$1=$2&").replace(/^[\/&]*(.*?)[\/&]*$/, "$1");
            // console.log("\n" + originalURL);
            // console.log("\n" + querystring);
            // cbw(null, sprintf("%s?%s", originalURL, querystring));
        }
    ], callback);
}

function get_live_caption_content(baseURL, sq, callback) {
    if(typeof sq == "number")
        sq = `sq/${sq}`;
    var options = {
        method: 'GET',
        url: `${baseURL}${sq}`
    }
    request(options, callback);
}

function get_channel_ID(username, callback) {
    var options = {
        method: 'GET',
        url: channels_url,
        qs: {
            part: 'id',
            forUsername: username,
            key: api_key
        },
        json: true
    };
    // console.log(JSON.stringify(options));
    request(options, callback);
}

function get_caption_details(videoId, callback) {
    var options = {
        method: 'GET',
        url: captions_url,
        qs: {
            part: 'snippet',
            videoId: videoId,
            key: api_key
        },
        json: true
    };
    // console.log(JSON.stringify(options));
    request(options, callback);
}

function get_caption_content(params, callback) {
    var options = {
        method: 'GET',
        url: timedtext_url,
        qs: {
            // v: videoId,
            lang: 'en'
        }
    };
    for(key in params)
        options.qs[key] = params[key];
    request(options, callback);
}

function get_english_caption(videoId, callback) {
    async.waterfall([
        function(cbw) {
            get_caption_details(videoId, function(errcd, respcd, bodcd) {
                if(errcd) console.log(errcd);
                // console.log(JSON.stringify(bodcd, null, 2));
                cbw(null, bodcd.items);
            });
        },
        function(captions, cbw) {
            var asr_alt = null;
            async.detect(captions, function(caption, cbt) {
                if(caption.snippet.language == 'en') {
                    if(caption.snippet.trackKind == 'standard') {
                        // console.log(JSON.stringify(caption, null, 2));
                        cbt(null, true);
                    }
                    else { // if(caption.snippet.trackKind == 'ASR')
                        // console.log(JSON.stringify(caption));
                        asr_alt = caption;
                        cbt(null, false);
                    }
                }
                else
                    cbt(false);

            }, function(err, result) {
                // console.log("result: " + videoId + " " + JSON.stringify(result));
                if(result){
                    cbw(err, result);
                }
                else if(allowASR && asr_alt){
                    cbw(err, asr_alt);
                }
                else{
                    cbw(null, null);
                }
            });
        },
        function(english_caption, cbw) {
            var params = {
                v: videoId
            };
            if(!english_caption)
                cbw(`\n\n\n\n\n\n\n\n++++++++++++++++++++\nNo English Captions\n++++++++++++++++++++\n${videoId}\n\n\n\n\n\n\n`);
            else if(english_caption.snippet.trackKind == "standard"){
                // console.log("Captions: "  + JSON.stringify(english_caption));
                if(english_caption.snippet.name != '')
                    params.name = english_caption.snippet.name;
                
                get_caption_content(params, function(errc, respc, bodc) {
                    if(errc) console.log(errc);
                    console.log("\n============================STANDARD==============================\n");
                    console.log(videoId + '\n');
                    console.log(bodc);
                    if(bodc.trim() == "") 
                        console.log("\n\n\n\n\n\n\n\n++++++++++++++++++++\nCaptions unavailable\n++++++++++++++++++++\n\n\n\n\n\n\n\n");
                    // cbw(null, bodc);
                    cbw(null);
                });
            }
            else if(allowASR) {
                get_asr_captions(videoId, function(errc, respc, bodc) {
                    if(errc) console.log(errc);
                    console.log("\n============================ASR==============================\n");
                    console.log(videoId + '\n');
                    if(bodc)
                        console.log(bodc);
                    else
                        console.log("\n\n\n\n\n\n\n\n++++++++++++++++++++\nCaptions unavailable\n++++++++++++++++++++\n\n\n\n\n\n\n\n");
                    // cbw(null, bodc);
                    cbw(null);
                });
            }
        }
    ], callback);
}

function search_youtube(params, amount, displayCaptions, callback) {
    var total_videos = 0;

    async.whilst(()=>amount > 0, function(cbwhilst) {
        var options = {
            method: 'GET',
            url: search_url,
            qs: {
                // q: query,
                // pageToken: 'CDIQAA',
                part: 'id', // Or snippet
                maxResults: ((amount > 50)?50:amount),
                safeSearch: "none",
                type: "video",
                videoCaption: allowASR?"any":"closedCaption",
                key: api_key
            },
            json: true
        };
        console.log(JSON.stringify(options, null, 2));
        async.waterfall([
            function(cbw) {

                if(!params.channelId && params.username) {
                    console.log(params.username);
                    get_channel_ID(params.username, cbw);
                }
                else
                    cbw(null, null, null);
            },
            function(respc, bodc, cbw) {
                if(bodc) {
                    delete params.username;
                    params.channelId = bodc.items[0].id;
                }
                for(key in params)
                    options.qs[key] = params[key];

                console.log(JSON.stringify(options, null, 2) + "\n++++++++++++++++++++++++++++++++++++++++++++++++++++\n\n");
                request(options, cbw);
            },
            function(respv, bodv, cbw) {
                // console.log(JSON.stringify(bodv, null, 2));
                if(displayCaptions) {
                    async.each(bodv.items, function(item, cbe) {
                        get_english_caption(item.id.videoId, cbe);
                    }, function(err, data) {
                        if(err) console.log(err);
                        cbw(null, bodv);
                    });
                }
                else
                    cbw(null, bodv);
            }
        ], function(err, data) {
            amount -= 50;
            total_videos += data.items.length;
            console.log(JSON.stringify(data, null, 2));
            console.log("\nNext Page: " + data.nextPageToken);
            params.pageToken = data.nextPageToken;
            if(!params.pageToken || data.items.length == 0)
                amount = 0;
            cbwhilst(err);
        });
    }, function(err) {
        console.log(`\n\n\n\n\n\n\n\n+++++++++++++++++++++++++++++++\nSearch ended at ${total_videos} videos\n+++++++++++++++++++++++++++++++\n\n\n\n\n\n\n\n`);
        if(callback)
            callback(err);
    });
}

function continuous_live_captions(feed_url, verbose) {
    var latest_sq = 0;
    var current_sq = 0;
    var completed_calls = 0;

    async.forever(function(cbf) {
        var get_more_captions = function(cbt) {
            if(verbose) console.log("New Attempt | # Calls: " + completed_calls);
            get_live_captions(feed_url, function(err, data) {
                completed_calls++;
                cbt(err);
                // console.log(JSON.stringify(data, null, 2));
                async.map(data.sq, function(item, cbm) {
                    var current_log = "";
                    current_sq = sscanf(item, 'sq/%d');
                    if(current_sq > latest_sq) {
                        get_live_caption_content(data.baseURL, item, function(err, respc, bodc) {
                            completed_calls++;
                            if(verbose) {
                                current_log += item + "\n";
                            }
                            current_log += bodc + "\n";
                            // console.log("current_log " + current_log);
                            latest_sq = current_sq;
                            cbm(null, current_log);
                        });
                    }
                    else {
                        cbm(null, "");
                    }
                }, function(err, logs) {
                    for(key in logs) {
                        console.log(logs[key]);
                    }
                    setTimeout(() => cbf(err), 5000);
                });
            });
        }

        var timeout_task = async.timeout(get_more_captions, 15000, "Timed out");
        async.retry(5, timeout_task, (err) => {if(err) cbf(err);});
    }, function(err) {
        console.log(JSON.stringify(err));
    });
}

// channelId: "UCvQECJukTDE2i6aCoMnS-Vg", // bigthink
// channelId: 'UC9-y-6csu5WGm29I7JiwpnA', // Computerphile
// channelId: 'UCIsp57CkuqoPQyHP2B2Y5NA', // MillBeeful

allowASR = true;

search_youtube({
    // username: "JoergSprave",
    // username: "wheeloffortune",
    // username: "numberphile",
    // username: "EthosLab",
    // username: "BlueXephos",
    username: "SSoHPKC",
    order: "date",
    // pageToken: 'CDIQAA'
    // q: "after the unemployment rate declines below"
}, 1000, true, null);

// search_youtube({
//     // videoCaption: "closedCaption",
//     username: "HSN",
//     order: "date",
//     eventType: "live"
//     // pageToken: 'CDIQAA'
//     // q: "HSN Livestream"
// }, 1000, false, null);

// get_livestream_feed("uixUv3Ydwt0", function(err, feed_url) { // HSN Livestream: "uixUv3Ydwt0"  (Only consistent captioned livestream)
//     console.log(feed_url);
//     continuous_live_captions(feed_url, true);
// });

// var feed_url = "https://manifest.googlevideo.com/api/manifest/dash/ip/107.1.143.3/gcr/us/as/fmp4_audio_clear%2Cwebm_audio_clear%2Cwebm2_audio_clear%2Cfmp4_sd_hd_clear%2Cwebm2_sd_hd_clear/ipbits/0/sparams/as%2Cgcr%2Chfr%2Cid%2Cip%2Cipbits%2Citag%2Cplaylist_type%2Crequiressl%2Csource%2Cexpire/key/yt6/source/yt_live_broadcast/hfr/1/fexp/9413140%2C9416126%2C9416891%2C9419452%2C9422596%2C9428398%2C9429854%2C9431012%2C9432182%2C9432362%2C9432650%2C9432683%2C9433096%2C9433380%2C9433851%2C9433946%2C9435526%2C9435773%2C9435876%2C9435920%2C9436013%2C9436097%2C9436986%2C9437066%2C9437403%2C9437553%2C9438336%2C9438523%2C9438956/id/uixUv3Ydwt0.2/expire/1465868610/upn/igPnsHXdiRg/signature/5CA82733CB9F944FC860857949DCA6820FE50C60.1C0D96F4B3719DD52282B97F408274C8BF0A2505/itag/0/playlist_type/LIVE/requiressl/yes/sver/3";

// continuous_live_captions(feed_url, false);

// get_live_captions(feed_url, function(err, data) {
//     console.log(JSON.stringify(data, null, 2));
//     async.times(1000, function(sq, cbt) {
//         get_live_caption_content(data.baseURL, sq, function(errc, respc, bodc) {
//             cbt(errc, bodc);
//         });
//     }, function(err, captions) {
//         console.log(captions);
//     });
// });