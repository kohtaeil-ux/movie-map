import React, { useEffect, useRef, useState } from 'react';

declare const L: any; // Leaflet 전역 객체 선언

interface LocationItem {
  MovieTitle: string;
  LocationName: string;
  Coordinates: string;
  SceneImageUrl: string;
  Description: string;
  YoutubeUrl: string;
  PosterUrl?: string;
  lat: number;
  lng: number;
}

interface UserRecord {
  isLiked: boolean;
  visitHistory?: string[];
}

export default function App() {
  const mapRef = useRef<HTMLDivElement>(null);
  const adRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [allData, setAllData] = useState<LocationItem[]>([]);
  const [markers, setMarkers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<string>('');
  const [myLocationMarker, setMyLocationMarker] = useState<any>(null);
  const [activePopupItem, setActivePopupItem] = useState<LocationItem | null>(null);

  // 마이페이지 / 서랍 모달 상태
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'liked' | 'visited'>('liked');

  // 기부 및 요청 팝업 상태
  const [isDonateOpen, setIsDonateOpen] = useState(false);
  const [requestMovieTitle, setRequestMovieTitle] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [userRecords, setUserRecords] = useState<{ [key: string]: UserRecord }>(() => {
    try {
      const saved = localStorage.getItem('movie_map_user_records_v3');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQEKtaZqTTM8UOBscio1E6ubJIzoFrte9oWOUtS69SpDBAjT4NuQIYwFKI6tRTr9Kd7nu3i9fHrdlb6/pub?output=csv';
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzyrIsG3bJeT7HHrwm3UsiQr4tA-cO1sRUzpAbhESgZmqR8d-aSeGopukAD8c1VUNwQ/exec';

  useEffect(() => {
    try {
      localStorage.setItem('movie_map_user_records_v3', JSON.stringify(userRecords));
    } catch (e) {
      console.error('저장 실패:', e);
    }
  }, [userRecords]);

  // 카카오 애드핏 스크립트 동적 로드
  useEffect(() => {
    if (!adRef.current) return;
    if (adRef.current.querySelector('ins')) return;

    const ins = document.createElement('ins');
    ins.className = 'kakao_ad_area';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-unit', 'DAN-mhLeRLPzRhfWLipn');
    ins.setAttribute('data-ad-width', '320');
    ins.setAttribute('data-ad-height', '50');

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = '//t1.kakaocdn.net/kas/static/ba.min.js';
    script.async = true;

    adRef.current.appendChild(ins);
    adRef.current.appendChild(script);
  }, []);

  const parseCSVLine = (textLine: string) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < textLine.length; i++) {
      const char = textLine[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
  };

  const parseCSV = (text: string): LocationItem[] => {
    const lines = text.split('\n');
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]);
    const result: LocationItem[] = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const currentLine = parseCSVLine(lines[i]);
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = currentLine[index] ? currentLine[index] : '';
      });

      const coordRaw = obj.Coordinates || '';
      if (coordRaw.includes(',')) {
        const parts = coordRaw.split(',');
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          obj.lat = lat;
          obj.lng = lng;
          result.push(obj);
        }
      }
    }
    return result;
  };

  // Leaflet 지도 초기화
  useEffect(() => {
    if (!mapRef.current || !window.L) return;

    if (mapRef.current._leaflet_id) {
      mapRef.current._leaflet_id = null;
    }

    const map = L.map(mapRef.current, {
      center: [36.5, 127.5],
      zoom: 7,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    setMapInstance(map);

    fetch(SHEET_CSV_URL)
      .then((res) => res.text())
      .then((csvText) => {
        const parsedData = parseCSV(csvText);
        setAllData(parsedData);
      })
      .catch((err) => {
        console.error('데이터 로드 실패:', err);
      });

    return () => {
      map.remove();
    };
  }, []);

  const toggleLike = (key: string) => {
    setUserRecords((prev) => {
      const current = prev[key] || { isLiked: false, visitHistory: [] };
      return {
        ...prev,
        [key]: { ...current, isLiked: !current.isLiked },
      };
    });
  };

  const addVisit = (key: string) => {
    const now = new Date();
    const timeString = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    setUserRecords((prev) => {
      const current = prev[key] || { isLiked: false, visitHistory: [] };
      const history = current.visitHistory ? [...current.visitHistory, timeString] : [timeString];
      return {
        ...prev,
        [key]: { ...current, visitHistory: history },
      };
    });
  };

  const removeVisit = (key: string, indexToRemove: number) => {
    setUserRecords((prev) => {
      const current = prev[key];
      if (!current || !current.visitHistory) return prev;
      const history = current.visitHistory.filter((_, idx) => idx !== indexToRemove);
      return {
        ...prev,
        [key]: { ...current, visitHistory: history },
      };
    });
  };

  // 마커 렌더링 및 검색/필터 연동
  useEffect(() => {
    if (!mapInstance || allData.length === 0) return;

    markers.forEach((m) => m.remove());
    const newMarkers: any[] = [];
    let firstMatchLatLng = null;

    const query = searchTerm.toLowerCase();

    allData.forEach((item) => {
      const matchesSearch =
        item.MovieTitle.toLowerCase().includes(query) ||
        item.LocationName.toLowerCase().includes(query);

      const matchesSelectedMovie = selectedMovie ? item.MovieTitle === selectedMovie : true;

      if (searchTerm && !matchesSearch) return;
      if (selectedMovie && !matchesSelectedMovie) return;

      const latLng = [item.lat, item.lng];

      if (!firstMatchLatLng) {
        firstMatchLatLng = latLng;
      }

      const marker = L.marker(latLng).addTo(mapInstance);
      marker.bindTooltip(item.LocationName, { direction: 'top', offset: [0, -20] });

      marker.on('click', () => {
        setActivePopupItem(item);
        mapInstance.panTo(latLng);
      });

      newMarkers.push(marker);
    });

    setMarkers(newMarkers);

    if ((searchTerm || selectedMovie) && firstMatchLatLng) {
      mapInstance.setView(firstMatchLatLng, 12);
    } else if (!searchTerm && !selectedMovie && allData.length > 0) {
      mapInstance.setView([allData[0].lat, allData[0].lng], 7);
    }
  }, [searchTerm, selectedMovie, allData, mapInstance]);

  const handlePanToCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('이 브라우저는 위치 정보를 지원하지 않습니다.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latLng = [position.coords.latitude, position.coords.longitude];

        mapInstance.setView(latLng, 14);

        if (myLocationMarker) {
          myLocationMarker.remove();
        }

        const customIcon = L.divIcon({
          className: 'custom-user-marker',
          html: '<div style="background:#4285F4; width:16px; height:16px; border-radius:50%; border:2px solid white; box-shadow:0 0 6px rgba(0,0,0,0.3);"></div>',
          iconSize: [16, 16],
        });

        const marker = L.marker(latLng, { icon: customIcon }).addTo(mapInstance);
        setMyLocationMarker(marker);
      },
      () => {
        alert('위치 정보를 가져오는 데 실패했습니다. 위치 권한을 확인해주세요.');
      }
    );
  };

  const handleSelectLocationFromDrawer = (item: LocationItem) => {
    setIsDrawerOpen(false);
    setActivePopupItem(item);
    if (mapInstance) {
      mapInstance.setView([item.lat, item.lng], 14);
    }
  };

  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestMovieTitle.trim()) {
      alert('요청하실 영화 제목을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        movieTitle: requestMovieTitle,
        message: requestMessage,
      }),
    })
      .then(() => {
        alert('영화 요청이 성공적으로 접수되었습니다! 소중한 의견 감사합니다.');
        setRequestMovieTitle('');
        setRequestMessage('');
        setIsSubmitting(false);
      })
      .catch((err) => {
        console.error('요청 전송 실패:', err);
        alert('전송 중 오류가 발생했습니다. 다시 시도해 주세요.');
        setIsSubmitting(false);
      });
  };

  const movieMap = new Map();
  allData.forEach((item) => {
    if (!movieMap.has(item.MovieTitle)) {
      movieMap.set(item.MovieTitle, item);
    }
  });
  const uniqueMovies = Array.from(movieMap.values());

  const activeRecordKey = activePopupItem ? `${activePopupItem.MovieTitle}_${activePopupItem.LocationName}` : '';
  const activeRecord = userRecords[activeRecordKey] || { isLiked: false, visitHistory: [] };

  const likedItems = allData.filter((item) => {
    const key = `${item.MovieTitle}_${item.LocationName}`;
    return userRecords[key]?.isLiked;
  });

  const visitedItems = allData.filter((item) => {
    const key = `${item.MovieTitle}_${item.LocationName}`;
    return userRecords[key]?.visitHistory && userRecords[key].visitHistory!.length > 0;
  });

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', position: 'relative' }}>
      {/* 상단 검색바 & 버튼 영역 */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '70px',
        zIndex: 1000,
        display: 'flex',
        gap: '8px',
        width: 'calc(100% - 90px)',
        maxWidth: '360px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          background: 'white',
          padding: '8px 14px',
          borderRadius: '24px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          boxSizing: 'border-box'
        }}>
          <input
            type="text"
            placeholder="🎬 영화/촬영지 검색"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (e.target.value) setSelectedMovie('');
            }}
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              fontSize: '13px',
              fontFamily: 'sans-serif',
              background: 'transparent',
              color: '#000000',
              WebkitTextFillColor: '#000000'
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#888', padding: '0 4px' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* 내 저장 목록(마이페이지) 버튼 */}
        <button
          onClick={() => setIsDrawerOpen(true)}
          style={{
            background: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '42px',
            height: '42px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            flexShrink: '0',
            position: 'relative'
          }}
          title="내 목록 보기"
        >
          📂
          {(likedItems.length > 0 || visitedItems.length > 0) && (
            <span style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              width: '8px',
              height: '8px',
              background: '#e53935',
              borderRadius: '50%'
            }} />
          )}
        </button>

        {/* 기부 및 요청 버튼 */}
        <button
          onClick={() => setIsDonateOpen(true)}
          style={{
            background: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '42px',
            height: '42px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            flexShrink: '0'
          }}
          title="개발자 후원 및 영화 요청"
        >
          ☕
        </button>

        {/* 내 위치 이동 버튼 */}
        <button
          onClick={handlePanToCurrentLocation}
          style={{
            background: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '42px',
            height: '42px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            flexShrink: '0'
          }}
          title="내 위치로 이동"
        >
          🧭
        </button>
      </div>

      {/* 리액트 기반 커스텀 팝업창 */}
      {activePopupItem && (
        <div style={{
          position: 'absolute',
          top: '75px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          padding: '14px',
          width: '260px',
          maxHeight: '65vh',
          overflowY: 'auto',
          fontFamily: 'sans-serif',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#1a73e8' }}>{activePopupItem.MovieTitle}</h3>
            <button
              onClick={() => setActivePopupItem(null)}
              style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#888', padding: '0' }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#333' }}>📍 {activePopupItem.LocationName}</p>
            <button
              onClick={() => toggleLike(activeRecordKey)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: 0 }}
              title="찜하기"
            >
              {activeRecord.isLiked ? '❤️' : '🤍'}
            </button>
          </div>

          {activePopupItem.SceneImageUrl && (
            <img
              src={activePopupItem.SceneImageUrl}
              alt={activePopupItem.LocationName}
              style={{ width: '100%', height: '120px', borderRadius: '6px', marginBottom: '8px', objectFit: 'cover' }}
            />
          )}

          {activePopupItem.Description && (
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666', lineHeight: '1.4' }}>
              {activePopupItem.Description}
            </p>
          )}

          {/* 성지순례 체크인 영역 */}
          <div style={{ background: '#f8f9fa', padding: '8px', borderRadius: '6px', marginBottom: '8px', border: '1px solid #eee' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: activeRecord.visitHistory && activeRecord.visitHistory.length > 0 ? '6px' : '0' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#555' }}>
                성지순례 체크인 ({activeRecord.visitHistory ? activeRecord.visitHistory.length : 0}회)
              </span>
              <button
                onClick={() => addVisit(activeRecordKey)}
                style={{ background: '#34a853', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                + 체크인 기록
              </button>
            </div>

            {activeRecord.visitHistory && activeRecord.visitHistory.length > 0 && (
              <div style={{ maxHeight: '90px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {activeRecord.visitHistory.map((timeStr, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '3px 6px', borderRadius: '4px', border: '1px solid #e0e0e0', fontSize: '10px' }}>
                    <span style={{ color: '#137333' }}>⏱️ {timeStr}</span>
                    <button
                      onClick={() => removeVisit(activeRecordKey, idx)}
                      style={{ background: 'none', border: 'none', color: '#c5221f', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', padding: '0 4px' }}
                      title="기록 삭제"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {activePopupItem.YoutubeUrl && (
            <a href={activePopupItem.YoutubeUrl} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#1a73e8', fontWeight: 'bold', textDecoration: 'none' }}>
              ▶ 유튜브 영상에서 보기
            </a>
          )}
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${activePopupItem.lat},${activePopupItem.lng}`} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: '12px', color: '#34a853', fontWeight: 'bold', textDecoration: 'none' }}>
            🚗 현재 위치에서 길찾기
          </a>

          {/* 🎬 유튜브 영상 플레이어 영역 (YoutubeMusicUrl이 있을 때만 표시) */}
          {activePopupItem.YoutubeMusicUrl && (() => {
            const getYouTubeId = (url: string) => {
              const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
              const match = url.match(regExp);
              return (match && match[2].length === 11) ? match[2] : null;
            };
            const videoId = getYouTubeId(activePopupItem.YoutubeMusicUrl);

            return videoId ? (
              <div style={{ marginBottom: '8px' }}>
                <span style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#555', marginBottom: '4px' }}>
                  🎵 OST
                </span>
                <div style={{ width: '100%', aspectRatio: '1/1', borderRadius: '6px', overflow: 'hidden', background: '#000' }}>
                  <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${videoId}`}
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  ></iframe>
                </div>
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* 기부 및 영화 요청 팝업 모달 */}
{isDonateOpen && (
  <div style={{
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'rgba(0,0,0,0.5)',
    zIndex: 2000,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontFamily: 'sans-serif'
  }}>
    <div style={{
      background: 'white',
      width: '90%',
      maxWidth: '360px',
      maxHeight: '85vh',
      borderRadius: '16px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
      boxSizing: 'border-box',
      overflowY: 'auto'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '17px', color: '#202124' }}>☕ 개발자 후원 & 영화 요청</h2>
        <button
          onClick={() => setIsDonateOpen(false)}
          style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' }}
        >
          ✕
        </button>
      </div>

      {/* 안내 스토리 텍스트 */}
      <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '8px', fontSize: '12px', color: '#444', lineHeight: '1.5', marginBottom: '14px', border: '1px solid #eee' }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: '#1a73e8' }}>안녕하세요, 해석왕 고태일입니다.</p>
        <p style={{ margin: '0 0 6px 0' }}>영화를 사랑하는 모든 분들을 위해 코딩 하나 모르는 제가 이 어플을 만들기 위해 무단히 노력하고 있습니다.</p>
        <p style={{ margin: '0 0 6px 0' }}>하지만 서버 유지비나 지도 API 등 여러 비용적인 문제가 있고, 모든 영화를 혼자서 발굴하기엔 역부족입니다.</p>
        <p style={{ margin: 0 }}>광고 클릭이나 따뜻한 기부가 서비스 지속에 큰 힘이 됩니다. 많은 애용 부탁드립니다!</p>
      </div>

      {/* 영화 요청 및 기부 통합 폼 */}
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          // 1. 기존 시트 등록 함수 실행
          handleRequestSubmit(e);
          // 2. 카카오페이 송금 링크 동시 오픈 (팝업 차단 방지를 위해 직접 window.open 활용)
          window.open("https://qr.kakaopay.com/FPKyyZ36s", "_blank");
        }} 
        style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}
      >
        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#333' }}>🎬 원하는 영화/촬영지 요청하기</span>
        <input
          type="text"
          placeholder="예: 러브레터 오타루 촬영지"
          value={requestMovieTitle}
          onChange={(e) => setRequestMovieTitle(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px', outline: 'none' }}
        />
        <textarea
          placeholder="남기실 말씀이나 요청 사항 (선택)"
          value={requestMessage}
          onChange={(e) => setRequestMessage(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px', outline: 'none', height: '50px', resize: 'none' }}
        />
        <button
          type="submit"
          disabled={isSubmitting}
          style={{ 
            background: '#fee500', 
            color: '#191919', 
            border: 'none', 
            padding: '12px', 
            borderRadius: '8px', 
            fontSize: '13px', 
            fontWeight: 'bold', 
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            marginTop: '4px'
          }}
        >
          {isSubmitting ? '처리 중...' : '💛 기부하고 요청 등록하기 🔗'}
        </button>
      </form>
    </div>
  </div>
)}

      {/* 마이페이지 / 내 서랍 모달 */}
      {isDrawerOpen && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.5)',
          zIndex: 2000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: 'sans-serif'
        }}>
          <div style={{
            background: 'white',
            width: '90%',
            maxWidth: '340px',
            maxHeight: '75vh',
            borderRadius: '16px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '17px', color: '#202124' }}>📂 내 성지순례 서랍</h2>
              <button
                onClick={() => setIsDrawerOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' }}
              >
                ✕
              </button>
            </div>

            {/* 탭 헤더 */}
            <div style={{ display: 'flex', borderBottom: '1px solid #eee', marginBottom: '12px' }}>
              <button
                onClick={() => setDrawerTab('liked')}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  border: 'none',
                  background: 'none',
                  borderBottom: drawerTab === 'liked' ? '2px solid #e53935' : 'none',
                  color: drawerTab === 'liked' ? '#e53935' : '#777',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                ❤️ 찜한 장소 ({likedItems.length})
              </button>
              <button
                onClick={() => setDrawerTab('visited')}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  border: 'none',
                  background: 'none',
                  borderBottom: drawerTab === 'visited' ? '2px solid #34a853' : 'none',
                  color: drawerTab === 'visited' ? '#34a853' : '#777',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                ✅ 체크인 목록 ({visitedItems.length})
              </button>
            </div>

            {/* 탭 콘텐츠 */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {drawerTab === 'liked' && (
                likedItems.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#999', textAlign: 'center', padding: '20px 0' }}>
                    아직 찜한 장소가 없습니다. 🤍를 눌러 장소를 보관해 보세요!
                  </p>
                ) : (
                  likedItems.map((item) => (
                    <div
                      key={`${item.MovieTitle}_${item.LocationName}`}
                      onClick={() => handleSelectLocationFromDrawer(item)}
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid #eee',
                        background: '#fcfcfc',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                      }}
                    >
                      {item.PosterUrl ? (
                        <img src={item.PosterUrl} alt={item.MovieTitle} style={{ width: '40px', height: '55px', objectFit: 'cover', borderRadius: '4px' }} />
                      ) : (
                        <div style={{ width: '40px', height: '55px', background: '#eee', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>🎬</div>
                      )}
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '11px', color: '#1a73e8', fontWeight: 'bold' }}>{item.MovieTitle}</div>
                        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📍 {item.LocationName}</div>
                      </div>
                      <span style={{ fontSize: '16px' }}>❤️</span>
                    </div>
                  ))
                )
              )}

              {drawerTab === 'visited' && (
                visitedItems.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#999', textAlign: 'center', padding: '20px 0' }}>
                    아직 체크인한 장소가 없습니다. 현장에 방문해서 체크인을 남겨보세요!
                  </p>
                ) : (
                  visitedItems.map((item) => {
                    const key = `${item.MovieTitle}_${item.LocationName}`;
                    const history = userRecords[key]?.visitHistory || [];
                    const lastVisit = history[history.length - 1] || '';
                    return (
                      <div
                        key={key}
                        onClick={() => handleSelectLocationFromDrawer(item)}
                        style={{
                          padding: '10px',
                          borderRadius: '8px',
                          border: '1px solid #eee',
                          background: '#fcfcfc',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px'
                        }}
                      >
                        {item.PosterUrl ? (
                          <img src={item.PosterUrl} alt={item.MovieTitle} style={{ width: '40px', height: '55px', objectFit: 'cover', borderRadius: '4px' }} />
                        ) : (
                          <div style={{ width: '40px', height: '55px', background: '#eee', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>🎬</div>
                        )}
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: '11px', color: '#34a853', fontWeight: 'bold' }}>{item.MovieTitle} (총 {history.length}회 방문)</div>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📍 {item.LocationName}</div>
                          <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>최근: {lastVisit}</div>
                        </div>
                        <span style={{ fontSize: '16px' }}>✅</span>
                      </div>
                    );
                  })
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* 하단 세로 비율 고정 포스터 카드 목록 */}
      <div style={{
        position: 'absolute',
        bottom: '65px',
        left: '0',
        right: '0',
        zIndex: 1000,
        display: 'flex',
        gap: '10px',
        overflowX: 'auto',
        padding: '10px 16px',
        boxSizing: 'border-box',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none'
      }}>
        <div
          onClick={() => { setSelectedMovie(''); setSearchTerm(''); setActivePopupItem(null); }}
          style={{
            flex: '0 0 80px',
            height: '118px',
            background: selectedMovie === '' && !searchTerm ? '#1a73e8' : 'white',
            color: selectedMovie === '' && !searchTerm ? 'white' : '#333',
            borderRadius: '10px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 'bold',
            transition: 'all 0.2s',
            border: selectedMovie === '' && !searchTerm ? '2px solid #1a73e8' : '1px solid #ddd',
            flexShrink: 0
          }}
        >
          <span style={{ fontSize: '22px', marginBottom: '4px' }}>🗺️</span>
          전체 보기
        </div>

        {uniqueMovies.map((item) => {
          const isSelected = selectedMovie === item.MovieTitle;
          return (
            <div
              key={item.MovieTitle}
              onClick={() => {
                setSelectedMovie(isSelected ? '' : item.MovieTitle);
                setSearchTerm('');
                setActivePopupItem(null);
              }}
              style={{
                flex: '0 0 80px',
                height: '118px',
                background: 'white',
                borderRadius: '10px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                cursor: 'pointer',
                overflow: 'hidden',
                position: 'relative',
                border: isSelected ? '3px solid #1a73e8' : '1px solid rgba(0,0,0,0.1)',
                transition: 'all 0.2s',
                transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                flexShrink: 0
              }}
            >
              {item.PosterUrl ? (
                <img
                  src={item.PosterUrl}
                  alt={item.MovieTitle}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                />
              ) : (
                <div style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#f1f3f4',
                  color: '#333',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  padding: '4px',
                  boxSizing: 'border-box'
                }}>
                  {item.MovieTitle}
                </div>
              )}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                color: 'white',
                fontSize: '11px',
                fontWeight: 'bold',
                padding: '6px 4px 4px 4px',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {item.MovieTitle}
              </div>
            </div>
          );
        })}
      </div>

      {/* 하단 고정 카카오 애드핏 배너 광고 영역 */}
      <div
        ref={adRef}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '55px',
          background: '#ffffff',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          boxShadow: '0 -2px 10px rgba(0,0,0,0.1)'
        }}
      />

      {/* 지도 영역 */}
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}