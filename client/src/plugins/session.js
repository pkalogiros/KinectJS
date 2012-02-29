/*********************************
* KINECT SESSION, 7/02/2012
*---------------------------------
* Maintains websockets active between 
* page loads (of the same domain only)
**********************************/
(function( kinect ) {
	var _saveSession = function() {
		localStorage.setItem( 'kinect_session', kinect.address );
		return false;
	};
	/*********************************
	* sessionPersist( BOOLEAN ), chainable added on vI
	*---------------------------------
	* If BOOLEAN is set to true, then session will be maintained for the
	* main (joints) websocket
	**********************************/
	kinect.sessionPersist = function( bool ) {
		if( bool === false )
		{
			localStorage.removeItem( 'kinect_session' );
			kinect.removeEventListener( 'openedSocket', _saveSession );

			return this;
		}

		var session = localStorage.getItem( 'kinect_session' );
		kinect.addEventListener( 'openedSocket', _saveSession );

		setTimeout( function() {
			session && kinect.make( session );
		}, 1250 );

		return this;
	};
})( kinect );