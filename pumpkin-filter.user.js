// ==UserScript==
// @name         떱플 아카이브 호박 필터
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  수집된 호박들 필터링해줌
// @author       SimpleBrush
// @match        https://wplace.samuelscheit.com/*
// @updateURL    https://raw.githubusercontent.com/SimpleBrush/WplacePumpkinFilter/main/pumpkin-filter.user.js
// @downloadURL  https://raw.githubusercontent.com/SimpleBrush/WplacePumpkinFilter/main/pumpkin-filter.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @connect      backend.wplace.live
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const CACHE_KEY = 'pumpkin_claimed_cache';
    let claimedCache = GM_getValue(CACHE_KEY, []);
    let isUpdating = false;
    let authFailed = false;

    // 떱플 백엔드에서 claimed 데이터 받아와 갱신
    function updateClaimedData() {
        if (isUpdating) {
            return Promise.resolve(claimedCache);
        }

        isUpdating = true;

        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest === 'undefined') {
                console.error('[Pumpkin Filter] GM_xmlhttpRequest 사용 불가. Tampermonkey(혹은 Violentmonkey) 써주셈');
                isUpdating = false;
                resolve(claimedCache);
                return;
            }

            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://backend.wplace.live/event/hallowen/pumpkins/claimed',
                headers: {
                    'Referer': 'https://wplace.live/',
                    'Origin': 'https://wplace.live'
                },
                onload: function(response) {
                    isUpdating = false;

                    if (response.status === 200) {
                        try {
                            const data = JSON.parse(response.responseText);
                            claimedCache = data.claimed || [];
                            GM_setValue(CACHE_KEY, claimedCache);
                            resolve(claimedCache);
                        } catch (error) {
                            console.error('[Pumpkin Filter] 데이터 파싱 오류:', error);
                            resolve(claimedCache);
                        }
                    } else if (response.status === 401) {
                        authFailed = true;
                        console.error('[Pumpkin Filter] 인증 실패. 떱플에서 로그인 안 한 듯?');
                        resolve(claimedCache);
                    } else {
                        console.error('[Pumpkin Filter] HTTP 오류:', response.status);
                        resolve(claimedCache);
                    }
                },
                onerror: function(error) {
                    isUpdating = false;
                    console.error('[Pumpkin Filter] 네트워크 오류:', error);
                    resolve(claimedCache);
                },
                ontimeout: function() {
                    isUpdating = false;
                    console.error('[Pumpkin Filter] 요청 시간 초과');
                    resolve(claimedCache);
                }
            });
        });
    }

    // unsafeWindow 써서 페이지 컨텍스트에 접근
    const targetWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    // 원본 fetch 저장
    const originalFetch = targetWindow.fetch;

    // fetch 오버라이드
    targetWindow.fetch = async function(...args) {
        const url = args[0];

        // pumpkin.json 요청인지 확인
        if (typeof url === 'string' && url.includes('/tiles/pumpkin.json')) {
            // claimed 데이터 갱신
            await updateClaimedData();

            // 인증 실패했으면 필터링 안 하고 원본 그대로 통과
            if (authFailed) {
                return originalFetch.apply(this, args);
            }

            try {
                // pumpkin.json 받아오기
                const response = await originalFetch.apply(this, args);
                const clonedResponse = response.clone();
                const pumpkinData = await clonedResponse.json();

                // 수집된 호박들 필터링
                const filteredData = {};

                for (const [id, pumpkin] of Object.entries(pumpkinData)) {
                    const numId = parseInt(id);
                    if (!claimedCache.includes(numId)) {
                        filteredData[id] = pumpkin;
                    }
                }

                // 수정된 응답 생성
                const modifiedResponse = new Response(JSON.stringify(filteredData), {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers
                });

                return modifiedResponse;
            } catch (error) {
                console.error('[Pumpkin Filter] pumpkin.json 처리 오류:', error);
                return originalFetch.apply(this, args);
            }
        }
        // pumpkin.json 요청 아니면 그냥 통과
        return originalFetch.apply(this, args);
    };

})();
